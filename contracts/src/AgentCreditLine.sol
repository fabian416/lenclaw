// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {ICreditScorer} from "./interfaces/ICreditScorer.sol";
import {IAgentVault} from "./interfaces/IAgentVault.sol";
import {IAgentVaultFactory} from "./interfaces/IAgentVaultFactory.sol";

/// @title AgentCreditLine - Per-agent credit facility (vault-per-agent model)
/// @notice Manages borrowing, repayment, and status tracking for each AI agent.
///         Each agent borrows from and repays to their individual AgentVault.
contract AgentCreditLine is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        ACTIVE,
        DELINQUENT,
        DEFAULT
    }

    struct CreditFacility {
        uint256 principal;
        uint256 accruedInterest;
        uint256 lastAccrualTimestamp;
        uint256 interestRateBps;
        uint256 creditLimit;
        Status status;
    }

    IERC20 public immutable usdc;
    IAgentRegistry public immutable registry;
    ICreditScorer public immutable scorer;
    IAgentVaultFactory public vaultFactory;

    uint256 public gracePeriod = 7 days;
    uint256 public delinquencyPeriod = 14 days;
    uint256 public defaultPeriod = 30 days;

    /// @notice RecoveryManager address authorized to write down debt
    address public recoveryManager;

    mapping(uint256 => CreditFacility) public facilities;
    mapping(uint256 => uint256) public lastPaymentTimestamp;

    // Credit history for scoring: tracks actual borrowing behavior
    mapping(uint256 => uint256) public loansRepaid;         // fully repaid loan cycles
    mapping(uint256 => uint256) public totalAmountBorrowed; // lifetime USDC borrowed

    event Drawdown(uint256 indexed agentId, uint256 amount);
    event Repayment(uint256 indexed agentId, uint256 amount, uint256 interestPaid, uint256 principalPaid);
    event StatusChanged(uint256 indexed agentId, Status oldStatus, Status newStatus);
    event CreditLineRefreshed(uint256 indexed agentId, uint256 newLimit, uint256 newRate);
    event DebtWrittenDown(uint256 indexed agentId, uint256 amount);
    event RecoveryManagerUpdated(address indexed recoveryManager);

    uint256 public constant MIN_DRAWDOWN = 10e6; // 10 USDC minimum

    constructor(address _usdc, address _registry, address _scorer, address _vaultFactory, address _owner)
        Ownable(_owner)
    {
        require(_usdc != address(0), "AgentCreditLine: zero usdc");
        require(_registry != address(0), "AgentCreditLine: zero registry");
        require(_scorer != address(0), "AgentCreditLine: zero scorer");
        require(_vaultFactory != address(0), "AgentCreditLine: zero vaultFactory");
        usdc = IERC20(_usdc);
        registry = IAgentRegistry(_registry);
        scorer = ICreditScorer(_scorer);
        vaultFactory = IAgentVaultFactory(_vaultFactory);
    }

    function setVaultFactory(address _vaultFactory) external onlyOwner {
        vaultFactory = IAgentVaultFactory(_vaultFactory);
    }

    function setRecoveryManager(address _recoveryManager) external onlyOwner {
        require(_recoveryManager != address(0), "AgentCreditLine: zero address");
        recoveryManager = _recoveryManager;
        emit RecoveryManagerUpdated(_recoveryManager);
    }

    function setGracePeriod(uint256 _period) external onlyOwner {
        require(_period <= 30 days, "AgentCreditLine: period too long");
        gracePeriod = _period;
    }

    function setDelinquencyPeriod(uint256 _period) external onlyOwner {
        require(_period <= 60 days, "AgentCreditLine: period too long");
        delinquencyPeriod = _period;
    }

    function setDefaultPeriod(uint256 _period) external onlyOwner {
        require(_period <= 90 days, "AgentCreditLine: period too long");
        defaultPeriod = _period;
    }

    /// @notice Get the agent's individual vault address
    function _getAgentVault(uint256 agentId) internal view returns (address) {
        address vault = vaultFactory.getVault(agentId);
        require(vault != address(0), "AgentCreditLine: no vault for agent");
        return vault;
    }

    /// @notice Refresh an agent's credit limit and rate from the scorer
    function refreshCreditLine(uint256 agentId) external {
        require(registry.isRegistered(agentId), "AgentCreditLine: agent not registered");
        _accrueInterest(agentId);

        (uint256 limit, uint256 rate) = scorer.calculateCreditLine(agentId);
        facilities[agentId].creditLimit = limit;
        facilities[agentId].interestRateBps = rate;

        emit CreditLineRefreshed(agentId, limit, rate);
    }

    /// @notice Borrow from the agent's individual vault up to credit limit
    function drawdown(uint256 agentId, uint256 amount) external nonReentrant {
        require(amount >= MIN_DRAWDOWN, "AgentCreditLine: amount too small");
        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        require(msg.sender == profile.wallet, "AgentCreditLine: not agent owner");

        // Lazy status check - detect delinquency/default before allowing new borrows
        _updateStatusInternal(agentId);
        require(facilities[agentId].status == Status.ACTIVE, "AgentCreditLine: not active");

        _accrueInterest(agentId);

        CreditFacility storage facility = facilities[agentId];

        // Initialize if first drawdown
        if (facility.creditLimit == 0) {
            (uint256 limit, uint256 rate) = scorer.calculateCreditLine(agentId);
            facility.creditLimit = limit;
            facility.interestRateBps = rate;
        }

        require(
            facility.principal + facility.accruedInterest + amount <= facility.creditLimit,
            "AgentCreditLine: exceeds credit limit"
        );

        facility.principal += amount;
        totalAmountBorrowed[agentId] += amount;
        lastPaymentTimestamp[agentId] = block.timestamp;

        // Borrow from the agent's individual vault
        address vault = _getAgentVault(agentId);
        IAgentVault(vault).borrow(profile.wallet, amount);

        emit Drawdown(agentId, amount);
    }

    /// @notice Repay principal + interest to the agent's individual vault
    function repay(uint256 agentId, uint256 amount) external nonReentrant {
        require(amount > 0, "AgentCreditLine: zero amount");
        _accrueInterest(agentId);

        CreditFacility storage facility = facilities[agentId];
        uint256 totalOutstanding = facility.principal + facility.accruedInterest;
        require(totalOutstanding > 0, "AgentCreditLine: nothing owed");

        if (amount > totalOutstanding) {
            amount = totalOutstanding;
        }

        // Pay interest first, then principal
        uint256 interestPaid;
        uint256 principalPaid;

        if (amount <= facility.accruedInterest) {
            interestPaid = amount;
            facility.accruedInterest -= amount;
        } else {
            interestPaid = facility.accruedInterest;
            principalPaid = amount - interestPaid;
            facility.accruedInterest = 0;
            facility.principal -= principalPaid;
        }

        // Track completed loan cycles for credit scoring
        uint256 totalAfterRepay = facility.principal + facility.accruedInterest;
        if (totalAfterRepay == 0) {
            loansRepaid[agentId]++;
        }

        // Only reset timer if meaningful payment (>= 5% of outstanding or fully paid off)
        if (totalAfterRepay == 0 || amount >= totalOutstanding / 20) {
            lastPaymentTimestamp[agentId] = block.timestamp;
            // If was delinquent and meaningful payment made, revert to active
            if (facility.status == Status.DELINQUENT) {
                emit StatusChanged(agentId, Status.DELINQUENT, Status.ACTIVE);
                facility.status = Status.ACTIVE;
            }
        }

        // Transfer repayment to the agent's individual vault
        // Pass interestPaid so vault only charges protocol fee on interest, not principal
        address vault = _getAgentVault(agentId);
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        usdc.forceApprove(vault, amount);
        IAgentVault(vault).receiveRepayment(amount, interestPaid);

        emit Repayment(agentId, amount, interestPaid, principalPaid);
    }

    /// @notice Write down debt after recovery/liquidation without requiring USDC transfer.
    ///         Called by RecoveryManager after distributing auction proceeds.
    /// @param agentId The agent whose debt to write down
    /// @param amount Amount of debt to forgive
    function writeDown(uint256 agentId, uint256 amount) external {
        require(
            msg.sender == recoveryManager || msg.sender == owner(),
            "AgentCreditLine: not authorized"
        );
        require(amount > 0, "AgentCreditLine: zero amount");

        _accrueInterest(agentId);

        CreditFacility storage facility = facilities[agentId];
        uint256 totalOutstanding = facility.principal + facility.accruedInterest;

        if (amount >= totalOutstanding) {
            facility.principal = 0;
            facility.accruedInterest = 0;
        } else {
            // Write down interest first, then principal
            if (amount <= facility.accruedInterest) {
                facility.accruedInterest -= amount;
            } else {
                uint256 principalReduction = amount - facility.accruedInterest;
                facility.accruedInterest = 0;
                facility.principal -= principalReduction;
            }
        }

        emit DebtWrittenDown(agentId, amount);
    }

    /// @notice Get total outstanding debt
    function getOutstanding(uint256 agentId) external view returns (uint256) {
        CreditFacility memory facility = facilities[agentId];
        uint256 pending = _pendingInterest(agentId);
        return facility.principal + facility.accruedInterest + pending;
    }

    /// @notice Get agent credit status
    function getStatus(uint256 agentId) external view returns (Status) {
        return facilities[agentId].status;
    }

    /// @notice Check and update delinquency/default status
    function updateStatus(uint256 agentId) external {
        _accrueInterest(agentId);
        _updateStatusInternal(agentId);
    }

    function _updateStatusInternal(uint256 agentId) internal {
        CreditFacility storage facility = facilities[agentId];
        if (facility.principal == 0 && facility.accruedInterest == 0) return;

        uint256 timeSincePayment = block.timestamp - lastPaymentTimestamp[agentId];
        Status oldStatus = facility.status;

        if (timeSincePayment > defaultPeriod) {
            facility.status = Status.DEFAULT;
            try registry.updateReputation(agentId, 0) {} catch {}
            // Auto-freeze vault to prevent bank run
            try vaultFactory.freezeVault(agentId, true) {} catch {}
        } else if (timeSincePayment > gracePeriod) {
            facility.status = Status.DELINQUENT;
        }

        if (oldStatus != facility.status) {
            emit StatusChanged(agentId, oldStatus, facility.status);
        }
    }

    function _accrueInterest(uint256 agentId) internal {
        CreditFacility storage facility = facilities[agentId];
        if (facility.principal == 0) {
            facility.lastAccrualTimestamp = block.timestamp;
            return;
        }

        uint256 pending = _pendingInterest(agentId);
        facility.accruedInterest += pending;
        facility.lastAccrualTimestamp = block.timestamp;
    }

    function _pendingInterest(uint256 agentId) internal view returns (uint256) {
        CreditFacility memory facility = facilities[agentId];
        if (facility.principal == 0 || facility.lastAccrualTimestamp == 0) return 0;

        uint256 elapsed = block.timestamp - facility.lastAccrualTimestamp;
        // Simple interest: principal * rate * time / (365 days * 10000)
        return (facility.principal * facility.interestRateBps * elapsed) / (365 days * 10000);
    }
}
