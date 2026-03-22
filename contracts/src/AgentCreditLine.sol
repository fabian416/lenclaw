// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {ICreditScorer} from "./interfaces/ICreditScorer.sol";
import {IAgentVault} from "./interfaces/IAgentVault.sol";
import {IAgentVaultFactory} from "./interfaces/IAgentVaultFactory.sol";

/// @title AgentCreditLine - Per-agent credit facility (vault-per-agent model)
/// @notice Manages borrowing, repayment, and status tracking for each AI agent.
///         Each agent borrows from and repays to their individual AgentVault.
///         Supports multiple assets (USDC, WETH, USDT) — reads the token from each agent's vault.
contract AgentCreditLine is Ownable, Pausable, ReentrancyGuard {
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

    IAgentRegistry public immutable registry;
    ICreditScorer public immutable scorer;
    IAgentVaultFactory public vaultFactory;

    uint256 public gracePeriod = 7 days;
    uint256 public delinquencyPeriod = 14 days;
    uint256 public defaultPeriod = 30 days;

    /// @notice RecoveryManager address authorized to write down debt
    address public recoveryManager;

    /// @notice SmartWallet enforcement: require agents to have a SmartWallet for drawdowns
    bool public requireSmartWallet = true;

    /// @notice Optional ZK verifier: if set, drawdowns require a valid ZK proof
    address public zkVerifier;
    bool public requireZKProof = false;

    mapping(uint256 => CreditFacility) public facilities;
    mapping(uint256 => uint256) public lastPaymentTimestamp;

    // Credit history for scoring: tracks actual borrowing behavior
    mapping(uint256 => uint256) public loansRepaid; // fully repaid loan cycles
    mapping(uint256 => uint256) public totalAmountBorrowed; // lifetime amount borrowed

    event Drawdown(uint256 indexed agentId, uint256 amount);
    event Repayment(uint256 indexed agentId, uint256 amount, uint256 interestPaid, uint256 principalPaid);
    event StatusChanged(uint256 indexed agentId, Status oldStatus, Status newStatus);
    event CreditLineRefreshed(uint256 indexed agentId, uint256 newLimit, uint256 newRate);
    event DebtWrittenDown(uint256 indexed agentId, uint256 amount);
    event RecoveryManagerUpdated(address indexed recoveryManager);

    uint256 public constant MIN_DRAWDOWN_6DEC = 10e6; // 10 USDC/USDT
    uint256 public constant MIN_DRAWDOWN_18DEC = 1e16; // 0.01 ETH

    constructor(address _registry, address _scorer, address _vaultFactory, address _owner) Ownable(_owner) {
        require(_registry != address(0), "AgentCreditLine: zero registry");
        require(_scorer != address(0), "AgentCreditLine: zero scorer");
        require(_vaultFactory != address(0), "AgentCreditLine: zero vaultFactory");
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
        require(_period >= 1 days, "AgentCreditLine: period too short");
        require(_period <= 30 days, "AgentCreditLine: period too long");
        gracePeriod = _period;
    }

    function setDelinquencyPeriod(uint256 _period) external onlyOwner {
        require(_period >= 3 days, "AgentCreditLine: period too short");
        require(_period <= 60 days, "AgentCreditLine: period too long");
        delinquencyPeriod = _period;
    }

    function setDefaultPeriod(uint256 _period) external onlyOwner {
        require(_period >= 7 days, "AgentCreditLine: period too short");
        require(_period <= 90 days, "AgentCreditLine: period too long");
        defaultPeriod = _period;
    }

    function setRequireSmartWallet(bool _require) external onlyOwner {
        requireSmartWallet = _require;
    }

    function setZKVerifier(address _verifier) external onlyOwner {
        zkVerifier = _verifier;
    }

    function setRequireZKProof(bool _require) external onlyOwner {
        requireZKProof = _require;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Get the agent's individual vault address
    function _getAgentVault(uint256 agentId) internal view returns (address) {
        address vault = vaultFactory.getVault(agentId);
        require(vault != address(0), "AgentCreditLine: no vault for agent");
        return vault;
    }

    /// @notice Get the ERC-20 token used by an agent's vault
    function _getAgentAsset(uint256 agentId) internal view returns (IERC20) {
        address vault = _getAgentVault(agentId);
        return IERC20(IAgentVault(vault).asset());
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
    /// @dev Caller must be the agent's operator wallet or SmartWallet.
    ///      Borrowed funds are sent to operator wallet (NOT SmartWallet) to avoid circular routing.
    function drawdown(uint256 agentId, uint256 amount) external nonReentrant whenNotPaused {
        uint256 minDrawdown = _getMinDrawdown(agentId);
        require(amount >= minDrawdown, "AgentCreditLine: amount too small");
        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);

        // Allow drawdown from operator wallet or SmartWallet
        require(msg.sender == profile.wallet || msg.sender == profile.smartWallet, "AgentCreditLine: not agent owner");

        // SmartWallet enforcement: agent must have a SmartWallet deployed
        if (requireSmartWallet) {
            require(profile.smartWallet != address(0), "AgentCreditLine: must have SmartWallet");
        }

        // Optional ZK proof gate: if enabled, agent must have a valid proof
        if (requireZKProof && zkVerifier != address(0)) {
            (bool ok, bytes memory data) =
                zkVerifier.staticcall(abi.encodeWithSignature("isProofValid(uint256)", agentId));
            require(ok && data.length >= 32 && abi.decode(data, (bool)), "AgentCreditLine: ZK proof required");
        }

        // Lazy status check - detect delinquency/default before allowing new borrows
        _updateStatusInternal(agentId);
        require(facilities[agentId].status == Status.ACTIVE, "AgentCreditLine: not active");

        _accrueInterest(agentId);

        CreditFacility storage facility = facilities[agentId];

        // Always refresh credit limit from scorer on every drawdown
        {
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
        // Do NOT reset lastPaymentTimestamp on drawdown — only repayment should reset the clock
        if (lastPaymentTimestamp[agentId] == 0) {
            lastPaymentTimestamp[agentId] = block.timestamp;
        }

        // Borrow from the agent's individual vault
        // Send to operator wallet (profile.wallet), NOT SmartWallet, to avoid circular routing
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

        // Only reset timer if authorized caller makes meaningful payment (>= 5% of outstanding or fully paid off)
        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        bool isAuthorizedRepayer =
            (msg.sender == profile.wallet || msg.sender == profile.smartWallet || msg.sender == profile.lockbox);
        if (totalAfterRepay == 0 || (isAuthorizedRepayer && amount >= totalOutstanding / 20)) {
            lastPaymentTimestamp[agentId] = block.timestamp;
            // If was delinquent and meaningful payment made, revert to active
            if (facility.status == Status.DELINQUENT) {
                emit StatusChanged(agentId, Status.DELINQUENT, Status.ACTIVE);
                facility.status = Status.ACTIVE;
            }
        }

        // Transfer repayment to the agent's individual vault
        // Read the token from the vault (supports USDC, WETH, USDT, etc.)
        IERC20 token = _getAgentAsset(agentId);
        address vault = _getAgentVault(agentId);
        token.safeTransferFrom(msg.sender, address(this), amount);
        token.forceApprove(vault, amount);
        IAgentVault(vault).receiveRepayment(amount, interestPaid);
        token.forceApprove(vault, 0);

        emit Repayment(agentId, amount, interestPaid, principalPaid);
    }

    /// @notice Write down debt after recovery/liquidation without requiring token transfer.
    ///         Called by RecoveryManager after distributing auction proceeds.
    function writeDown(uint256 agentId, uint256 amount) external {
        require(msg.sender == recoveryManager || msg.sender == owner(), "AgentCreditLine: not authorized");
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

    /// @notice Get minimum drawdown based on the asset's decimals
    function _getMinDrawdown(uint256 agentId) internal view returns (uint256) {
        address asset = vaultFactory.agentAssets(agentId);
        // Try to read decimals; default to 6 (USDC/USDT) if call fails
        try IERC20Metadata(asset).decimals() returns (uint8 d) {
            if (d >= 18) return MIN_DRAWDOWN_18DEC;
            return MIN_DRAWDOWN_6DEC;
        } catch {
            return MIN_DRAWDOWN_6DEC;
        }
    }

    function _pendingInterest(uint256 agentId) internal view returns (uint256) {
        CreditFacility memory facility = facilities[agentId];
        if (facility.principal == 0 || facility.lastAccrualTimestamp == 0) return 0;

        uint256 elapsed = block.timestamp - facility.lastAccrualTimestamp;
        // Simple interest: principal * rate * time / (365 days * 10000)
        return (facility.principal * facility.interestRateBps * elapsed) / (365 days * 10000);
    }
}
