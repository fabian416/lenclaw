// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IRevenueLockbox} from "./interfaces/IRevenueLockbox.sol";
import {IAgentVault} from "./interfaces/IAgentVault.sol";
import {IAgentCreditLine} from "./interfaces/IAgentCreditLine.sol";

/// @title RevenueLockbox - Immutable revenue capture contract for AI agents
/// @notice One deployed per agent. Captures all incoming revenue and splits between
///         debt repayment to the agent's individual AgentVault and remainder to the agent.
///         When a credit line is set, repayments route through AgentCreditLine to keep
///         both vault.totalBorrowed AND creditLine.principal/accruedInterest in sync.
contract RevenueLockbox is IRevenueLockbox, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable agent;
    address public immutable vault; // Agent's individual AgentVault
    uint256 public immutable agentId;
    IERC20 public immutable usdc;

    uint256 public repaymentRateBps; // e.g. 5000 = 50% of revenue goes to repayment
    uint256 public constant MIN_REPAYMENT_RATE_BPS = 1000; // 10% floor
    uint256 public constant MAX_REPAYMENT_RATE_BPS = 10000; // 100% ceiling

    uint256 public totalRevenueCapture;
    uint256 public totalRepaid;

    address public creditLine; // AgentCreditLine contract address

    modifier onlyVaultOrOwner() {
        require(msg.sender == vault, "RevenueLockbox: not vault");
        _;
    }

    modifier onlyAgentOrVault() {
        require(msg.sender == agent || msg.sender == vault, "RevenueLockbox: not agent or vault");
        _;
    }

    constructor(
        address _agent,
        address _vault,
        uint256 _agentId,
        address _usdc,
        uint256 _repaymentRateBps,
        address _creditLine
    ) {
        require(_agent != address(0), "RevenueLockbox: zero agent");
        require(_vault != address(0), "RevenueLockbox: zero vault");
        require(_usdc != address(0), "RevenueLockbox: zero usdc");
        require(_repaymentRateBps <= 10000, "RevenueLockbox: rate too high");

        agent = _agent;
        vault = _vault;
        agentId = _agentId;
        usdc = IERC20(_usdc);
        repaymentRateBps = _repaymentRateBps;

        if (_creditLine != address(0)) {
            creditLine = _creditLine;
        }
    }

    function setCreditLine(address _creditLine) external onlyVaultOrOwner {
        require(creditLine == address(0), "RevenueLockbox: credit line already set");
        creditLine = _creditLine;
    }

    /// @notice Update the repayment rate. Only callable by vault.
    /// @param newRateBps New rate in basis points (must be within MIN/MAX bounds)
    function setRepaymentRate(uint256 newRateBps) external onlyVaultOrOwner {
        require(newRateBps >= MIN_REPAYMENT_RATE_BPS, "RevenueLockbox: rate below minimum");
        require(newRateBps <= MAX_REPAYMENT_RATE_BPS, "RevenueLockbox: rate above maximum");

        uint256 oldRate = repaymentRateBps;
        repaymentRateBps = newRateBps;

        emit RepaymentRateUpdated(oldRate, newRateBps);
    }

    /// @notice Auto-adjust repayment rate based on outstanding debt vs credit limit.
    ///         Higher utilization → higher repayment rate.
    /// @param outstandingDebt Current outstanding debt
    /// @param creditLimit Current credit limit
    function adjustRateByDebt(uint256 outstandingDebt, uint256 creditLimit) external onlyVaultOrOwner {
        if (creditLimit == 0) return;

        uint256 utilizationBps = (outstandingDebt * 10000) / creditLimit;

        // Scale: 0% util → MIN_REPAYMENT_RATE_BPS, 100% util → MAX_REPAYMENT_RATE_BPS
        uint256 rateRange = MAX_REPAYMENT_RATE_BPS - MIN_REPAYMENT_RATE_BPS;
        uint256 newRate = MIN_REPAYMENT_RATE_BPS + (utilizationBps * rateRange) / 10000;

        if (newRate > MAX_REPAYMENT_RATE_BPS) newRate = MAX_REPAYMENT_RATE_BPS;

        uint256 oldRate = repaymentRateBps;
        repaymentRateBps = newRate;

        emit RepaymentRateUpdated(oldRate, newRate);
    }

    /// @notice Process all USDC revenue sitting in this contract.
    ///         Splits between repayment and remainder to agent.
    ///         When creditLine is set, routes debt portion through AgentCreditLine
    ///         so both vault.totalBorrowed AND creditLine.principal stay in sync.
    ///         Any repayment amount exceeding outstanding debt goes directly to vault as yield.
    function processRevenue() external nonReentrant onlyAgentOrVault {
        uint256 balance = usdc.balanceOf(address(this));
        require(balance > 0, "RevenueLockbox: no revenue");

        // Checks-Effects: update state before external calls
        uint256 repaymentAmount = (balance * repaymentRateBps) / 10000;
        uint256 agentAmount = balance - repaymentAmount;

        totalRevenueCapture += balance;
        if (repaymentAmount > 0) {
            totalRepaid += repaymentAmount;
        }

        // Interactions: external calls after all state updates
        if (repaymentAmount > 0) {
            if (creditLine != address(0)) {
                // Route through credit line to keep both accounting systems in sync
                uint256 outstanding = IAgentCreditLine(creditLine).getOutstanding(agentId);
                uint256 toDebt = repaymentAmount > outstanding ? outstanding : repaymentAmount;
                uint256 toVaultDirect = repaymentAmount - toDebt;

                if (toDebt > 0) {
                    // CreditLine.repay() pulls USDC from us, updates debt, forwards to vault
                    usdc.forceApprove(creditLine, toDebt);
                    IAgentCreditLine(creditLine).repay(agentId, toDebt);
                }

                if (toVaultDirect > 0) {
                    // Excess beyond debt goes directly to vault as yield for backers
                    usdc.forceApprove(vault, toVaultDirect);
                    IAgentVault(vault).receiveRepayment(toVaultDirect);
                }
            } else {
                // Fallback: no credit line set, send directly to vault
                usdc.forceApprove(vault, repaymentAmount);
                IAgentVault(vault).receiveRepayment(repaymentAmount);
            }
        }

        if (agentAmount > 0) {
            usdc.safeTransfer(agent, agentAmount);
        }

        emit RevenueProcessed(repaymentAmount, agentAmount);
    }

    function pendingRepayment() external view returns (uint256) {
        uint256 balance = usdc.balanceOf(address(this));
        return (balance * repaymentRateBps) / 10000;
    }

    /// @notice Rescue any ETH accidentally sent to this contract.
    ///         Sends trapped ETH to the agent wallet.
    function rescueETH() external onlyAgentOrVault {
        uint256 ethBalance = address(this).balance;
        require(ethBalance > 0, "RevenueLockbox: no ETH to rescue");
        (bool success,) = agent.call{value: ethBalance}("");
        require(success, "RevenueLockbox: ETH transfer failed");
        emit ETHRescued(agent, ethBalance);
    }

    /// @notice Accept ETH (converted off-chain or via DEX before processing)
    receive() external payable {
        emit RevenueReceived(address(0), msg.value);
    }

    fallback() external payable {
        emit RevenueReceived(address(0), msg.value);
    }
}
