// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AgentCreditLine} from "./AgentCreditLine.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title LiquidationKeeper - Monitors credit lines and triggers liquidation
/// @notice Callable by anyone; provides a keeper incentive (bounty) for triggering
///         liquidation of defaulted credit positions. Interfaces with the
///         RecoveryManager to initiate the full recovery flow.
contract LiquidationKeeper is Ownable {
    using SafeERC20 for IERC20;

    AgentCreditLine public immutable creditLine;
    IAgentRegistry public immutable registry;
    IERC20 public immutable usdc;

    address public recoveryManager;

    /// @notice Keeper bounty: percentage of outstanding debt paid as incentive
    uint256 public keeperBountyBps = 100; // 1% of outstanding debt

    /// @notice Maximum bounty cap in USDC (6 decimals)
    uint256 public maxBountyAmount = 1_000e6; // 1,000 USDC cap

    /// @notice Minimum time between liquidation checks for the same agent
    uint256 public cooldownPeriod = 1 hours;

    /// @notice Track last liquidation trigger time per agent
    mapping(uint256 => uint256) public lastTriggerTime;

    /// @notice Track which agents have already been liquidated
    mapping(uint256 => bool) public liquidated;

    // ── Events ──────────────────────────────────────────────────

    event LiquidationTriggered(
        uint256 indexed agentId,
        address indexed keeper,
        uint256 outstandingDebt,
        uint256 bountyPaid
    );
    event RecoveryManagerUpdated(address indexed recoveryManager);
    event KeeperBountyUpdated(uint256 bountyBps, uint256 maxBounty);
    event CooldownPeriodUpdated(uint256 period);

    // ── Constructor ─────────────────────────────────────────────

    constructor(
        address _creditLine,
        address _registry,
        address _usdc,
        address _recoveryManager,
        address _owner
    ) Ownable(_owner) {
        require(_creditLine != address(0), "LiquidationKeeper: zero credit line");
        require(_registry != address(0), "LiquidationKeeper: zero registry");
        require(_usdc != address(0), "LiquidationKeeper: zero usdc");
        require(_recoveryManager != address(0), "LiquidationKeeper: zero recovery manager");

        creditLine = AgentCreditLine(_creditLine);
        registry = IAgentRegistry(_registry);
        usdc = IERC20(_usdc);
        recoveryManager = _recoveryManager;
    }

    // ── Admin ───────────────────────────────────────────────────

    function setRecoveryManager(address _recoveryManager) external onlyOwner {
        require(_recoveryManager != address(0), "LiquidationKeeper: zero address");
        recoveryManager = _recoveryManager;
        emit RecoveryManagerUpdated(_recoveryManager);
    }

    function setKeeperBounty(uint256 _bountyBps, uint256 _maxBounty) external onlyOwner {
        require(_bountyBps <= 500, "LiquidationKeeper: bounty too high"); // Max 5%
        keeperBountyBps = _bountyBps;
        maxBountyAmount = _maxBounty;
        emit KeeperBountyUpdated(_bountyBps, _maxBounty);
    }

    function setCooldownPeriod(uint256 _period) external onlyOwner {
        cooldownPeriod = _period;
        emit CooldownPeriodUpdated(_period);
    }

    // ── Keeper Operations ───────────────────────────────────────

    /// @notice Check whether an agent is eligible for liquidation.
    /// @param agentId The agent to check
    /// @return eligible True if the agent can be liquidated now
    /// @return outstandingDebt The agent's total outstanding debt
    function checkLiquidation(uint256 agentId)
        public
        view
        returns (bool eligible, uint256 outstandingDebt)
    {
        // Must not already be liquidated
        if (liquidated[agentId]) return (false, 0);

        // Must be registered
        if (!registry.isRegistered(agentId)) return (false, 0);

        // Must be in DEFAULT status
        AgentCreditLine.Status status = creditLine.getStatus(agentId);
        if (status != AgentCreditLine.Status.DEFAULT) return (false, 0);

        // Must have outstanding debt
        outstandingDebt = creditLine.getOutstanding(agentId);
        if (outstandingDebt == 0) return (false, 0);

        // Must respect cooldown
        if (block.timestamp < lastTriggerTime[agentId] + cooldownPeriod) {
            return (false, outstandingDebt);
        }

        eligible = true;
    }

    /// @notice Trigger liquidation for a defaulted agent.
    ///         Callable by anyone (keeper). Pays a bounty from the keeper fund.
    ///         Calls RecoveryManager to initiate the recovery process.
    /// @param agentId The defaulted agent's ID
    function triggerLiquidation(uint256 agentId) external {
        (bool eligible, uint256 outstandingDebt) = checkLiquidation(agentId);
        require(eligible, "LiquidationKeeper: not eligible for liquidation");

        // Mark as liquidated and record trigger time
        liquidated[agentId] = true;
        lastTriggerTime[agentId] = block.timestamp;

        // Calculate keeper bounty
        uint256 bounty = (outstandingDebt * keeperBountyBps) / 10000;
        if (bounty > maxBountyAmount) {
            bounty = maxBountyAmount;
        }

        // Pay keeper bounty if contract has funds
        uint256 bountyPaid = 0;
        uint256 balance = usdc.balanceOf(address(this));
        if (bounty > 0 && balance >= bounty) {
            bountyPaid = bounty;
            usdc.safeTransfer(msg.sender, bountyPaid);
        } else if (balance > 0 && bounty > 0) {
            // Pay whatever is available
            bountyPaid = balance;
            usdc.safeTransfer(msg.sender, bountyPaid);
        }

        // Notify recovery manager to start the recovery process
        // The RecoveryManager will create a Dutch auction and coordinate distribution
        IRecoveryManagerTrigger(recoveryManager).startRecovery(agentId, outstandingDebt);

        emit LiquidationTriggered(agentId, msg.sender, outstandingDebt, bountyPaid);
    }

    /// @notice Fund the keeper contract with USDC for bounty payments
    /// @param amount Amount of USDC to deposit
    function fundBountyPool(uint256 amount) external {
        usdc.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Withdraw bounty pool funds (owner only)
    /// @param to Recipient address
    /// @param amount Amount to withdraw
    function withdrawBountyPool(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "LiquidationKeeper: zero address");
        usdc.safeTransfer(to, amount);
    }

    /// @notice Get the bounty pool balance
    function bountyPoolBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}

/// @notice Minimal interface for the RecoveryManager trigger call
interface IRecoveryManagerTrigger {
    function startRecovery(uint256 agentId, uint256 debtAmount) external;
}
