// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {ICreditScorer} from "./interfaces/ICreditScorer.sol";

/// @title AgentCreditLine - Per-agent credit facility
/// @notice Manages borrowing, repayment, and status tracking for each AI agent
contract AgentCreditLine is Ownable {
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
    address public vault;

    uint256 public gracePeriod = 7 days;
    uint256 public delinquencyPeriod = 14 days;
    uint256 public defaultPeriod = 30 days;

    mapping(uint256 => CreditFacility) public facilities;
    mapping(uint256 => uint256) public lastPaymentTimestamp;

    event Drawdown(uint256 indexed agentId, uint256 amount);
    event Repayment(uint256 indexed agentId, uint256 amount, uint256 interestPaid, uint256 principalPaid);
    event StatusChanged(uint256 indexed agentId, Status oldStatus, Status newStatus);
    event CreditLineRefreshed(uint256 indexed agentId, uint256 newLimit, uint256 newRate);

    constructor(address _usdc, address _registry, address _scorer, address _vault, address _owner) Ownable(_owner) {
        usdc = IERC20(_usdc);
        registry = IAgentRegistry(_registry);
        scorer = ICreditScorer(_scorer);
        vault = _vault;
    }

    function setVault(address _vault) external onlyOwner {
        vault = _vault;
    }

    function setGracePeriod(uint256 _period) external onlyOwner {
        gracePeriod = _period;
    }

    function setDelinquencyPeriod(uint256 _period) external onlyOwner {
        delinquencyPeriod = _period;
    }

    function setDefaultPeriod(uint256 _period) external onlyOwner {
        defaultPeriod = _period;
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

    /// @notice Borrow from the vault up to credit limit
    function drawdown(uint256 agentId, uint256 amount) external {
        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        require(msg.sender == profile.wallet, "AgentCreditLine: not agent owner");
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
        lastPaymentTimestamp[agentId] = block.timestamp;

        // Transfer USDC from vault to agent
        usdc.safeTransferFrom(vault, profile.wallet, amount);

        emit Drawdown(agentId, amount);
    }

    /// @notice Repay principal + interest
    function repay(uint256 agentId, uint256 amount) external {
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

        lastPaymentTimestamp[agentId] = block.timestamp;

        // If was delinquent and now paying, revert to active
        if (facility.status == Status.DELINQUENT) {
            emit StatusChanged(agentId, Status.DELINQUENT, Status.ACTIVE);
            facility.status = Status.ACTIVE;
        }

        usdc.safeTransferFrom(msg.sender, vault, amount);

        emit Repayment(agentId, amount, interestPaid, principalPaid);
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

        CreditFacility storage facility = facilities[agentId];
        if (facility.principal == 0 && facility.accruedInterest == 0) return;

        uint256 timeSincePayment = block.timestamp - lastPaymentTimestamp[agentId];
        Status oldStatus = facility.status;

        if (timeSincePayment > defaultPeriod) {
            // Default after 30 days without sufficient repayment
            facility.status = Status.DEFAULT;
            // Slash reputation on default
            try registry.updateReputation(agentId, 0) {} catch {}
        } else if (timeSincePayment > gracePeriod) {
            // Delinquent after grace period (7 days), reputation penalty begins
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
