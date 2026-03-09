// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {IRevenueLockbox} from "./interfaces/IRevenueLockbox.sol";
import {IAgentCreditLine} from "./interfaces/IAgentCreditLine.sol";
import {ICreditScorer} from "./interfaces/ICreditScorer.sol";

/// @title CreditScorer - On-chain credit scoring based on observable agent behavior
/// @notice All scoring factors are derived from real on-chain data:
///         30% revenue level, 25% revenue consistency, 20% credit history,
///         15% time in protocol, 10% debt-to-revenue ratio.
///         No TEE, no ZK, no manual reputation — only verifiable behavior.
contract CreditScorer is Ownable, ICreditScorer {
    IAgentRegistry public immutable registry;

    uint256 public minCreditLine = 100e6;     // 100 USDC (6 decimals)
    uint256 public maxCreditLine = 100_000e6; // 100,000 USDC
    uint256 public minRateBps = 300;          // 3% APR
    uint256 public maxRateBps = 2500;         // 25% APR

    // Revenue multiplier: credit line = revenue * multiplier / 100
    uint256 public revenueMultiplier = 300; // 3x revenue

    // Credit line contract for reading borrowing history
    address public creditLine;

    // Scoring weights (out of 100) — all based on observable on-chain data
    uint256 public constant WEIGHT_REVENUE = 30;       // How much they generate
    uint256 public constant WEIGHT_CONSISTENCY = 25;    // How steadily they generate it
    uint256 public constant WEIGHT_CREDIT_HISTORY = 20; // Past borrowing behavior
    uint256 public constant WEIGHT_TIME = 15;           // Time in protocol (more data = more confidence)
    uint256 public constant WEIGHT_DEBT_RATIO = 10;     // Not overextended

    // Time thresholds for maturity scoring
    uint256 public constant MAX_MATURITY_DAYS = 180; // 6 months for full maturity score

    constructor(address _registry, address _owner) Ownable(_owner) {
        registry = IAgentRegistry(_registry);
    }

    function setCreditLine(address _creditLine) external onlyOwner {
        creditLine = _creditLine;
    }

    function setParameters(
        uint256 _minCreditLine,
        uint256 _maxCreditLine,
        uint256 _minRateBps,
        uint256 _maxRateBps,
        uint256 _revenueMultiplier
    ) external onlyOwner {
        require(_minCreditLine <= _maxCreditLine, "CreditScorer: invalid credit range");
        require(_minRateBps <= _maxRateBps, "CreditScorer: invalid rate range");
        require(_maxRateBps <= 10000, "CreditScorer: rate too high");

        minCreditLine = _minCreditLine;
        maxCreditLine = _maxCreditLine;
        minRateBps = _minRateBps;
        maxRateBps = _maxRateBps;
        revenueMultiplier = _revenueMultiplier;

        emit ParametersUpdated(_minCreditLine, _maxCreditLine, _minRateBps, _maxRateBps);
    }

    /// @notice Calculate credit line based on observable on-chain behavior
    /// @param agentId The agent's NFT ID
    /// @return creditLimit Maximum borrow amount in USDC (6 decimals)
    /// @return interestRateBps Annual interest rate in basis points
    function calculateCreditLine(uint256 agentId)
        external
        view
        returns (uint256 creditLimit, uint256 interestRateBps)
    {
        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        require(profile.lockbox != address(0), "CreditScorer: no lockbox");

        IRevenueLockbox lockbox = IRevenueLockbox(profile.lockbox);
        uint256 totalRevenue = lockbox.totalRevenueCapture();

        // --- 1. Revenue Level (30%): how much total revenue ---
        uint256 baseCreditLine = (totalRevenue * revenueMultiplier) / 100;
        uint256 revenueScore;
        if (baseCreditLine >= maxCreditLine) {
            revenueScore = 100;
        } else if (baseCreditLine <= minCreditLine) {
            revenueScore = 0;
        } else {
            revenueScore = ((baseCreditLine - minCreditLine) * 100) / (maxCreditLine - minCreditLine);
        }

        // --- 2. Revenue Consistency (25%): epochs with revenue / total epochs ---
        // An agent with 6/6 months of revenue is far more creditworthy than 1/6
        uint256 consistencyScore;
        uint256 currentEp = lockbox.currentEpoch();
        if (currentEp > 0) {
            uint256 epochsActive = lockbox.epochsWithRevenue();
            // +1 because epoch 0 counts
            uint256 totalEpochs = currentEp + 1;
            consistencyScore = (epochsActive * 100) / totalEpochs;
            if (consistencyScore > 100) consistencyScore = 100;
        } else if (totalRevenue > 0) {
            // Still in first epoch but has revenue
            consistencyScore = 50; // Partial credit — too early to judge consistency
        }

        // --- 3. Credit History (20%): past borrowing behavior ---
        // Completed loan cycles are the strongest predictor of future repayment
        uint256 creditHistoryScore;
        if (creditLine != address(0)) {
            (bool ok, bytes memory data) = creditLine.staticcall(
                abi.encodeWithSignature("loansRepaid(uint256)", agentId)
            );
            if (ok && data.length >= 32) {
                uint256 completedLoans = abi.decode(data, (uint256));
                // Scale: 3+ completed loans = full score
                if (completedLoans >= 3) {
                    creditHistoryScore = 100;
                } else {
                    creditHistoryScore = (completedLoans * 100) / 3;
                }
            }
            // Check if currently delinquent — penalize heavily
            (bool ok2, bytes memory data2) = creditLine.staticcall(
                abi.encodeWithSignature("getStatus(uint256)", agentId)
            );
            if (ok2 && data2.length >= 32) {
                uint8 status = abi.decode(data2, (uint8));
                if (status == 1) creditHistoryScore = creditHistoryScore / 2; // DELINQUENT: halve
                if (status == 2) creditHistoryScore = 0;                      // DEFAULT: zero
            }
        }

        // --- 4. Time in Protocol (15%): days since registration, max 180 days ---
        uint256 timeScore;
        if (profile.registeredAt > 0 && block.timestamp > profile.registeredAt) {
            uint256 daysActive = (block.timestamp - profile.registeredAt) / 1 days;
            if (daysActive >= MAX_MATURITY_DAYS) {
                timeScore = 100;
            } else {
                timeScore = (daysActive * 100) / MAX_MATURITY_DAYS;
            }
        }

        // --- 5. Debt-to-Revenue Ratio (10%): not overextended ---
        // Lower current debt relative to revenue = better score
        uint256 debtRatioScore = 100; // Default: no debt = perfect
        if (creditLine != address(0) && totalRevenue > 0) {
            (bool ok3, bytes memory data3) = creditLine.staticcall(
                abi.encodeWithSignature("getOutstanding(uint256)", agentId)
            );
            if (ok3 && data3.length >= 32) {
                uint256 outstanding = abi.decode(data3, (uint256));
                if (outstanding > 0) {
                    // Debt as % of total revenue: 0% = 100 score, 100%+ = 0 score
                    uint256 debtPct = (outstanding * 100) / totalRevenue;
                    debtRatioScore = debtPct >= 100 ? 0 : 100 - debtPct;
                }
            }
        }

        // --- Composite weighted score ---
        uint256 compositeScore = (
            revenueScore * WEIGHT_REVENUE
            + consistencyScore * WEIGHT_CONSISTENCY
            + creditHistoryScore * WEIGHT_CREDIT_HISTORY
            + timeScore * WEIGHT_TIME
            + debtRatioScore * WEIGHT_DEBT_RATIO
        ) / 100;

        // --- Credit limit from composite score ---
        creditLimit = minCreditLine + (compositeScore * (maxCreditLine - minCreditLine)) / 100;

        // Clamp credit limit
        if (creditLimit < minCreditLine) creditLimit = minCreditLine;
        if (creditLimit > maxCreditLine) creditLimit = maxCreditLine;

        // --- Interest rate: inversely proportional to composite score ---
        // Higher score = lower rate (reward good behavior)
        uint256 rateSpread = maxRateBps - minRateBps;
        uint256 rateDiscount = (compositeScore * rateSpread) / 100;
        interestRateBps = maxRateBps - rateDiscount;

        // Clamp rate
        if (interestRateBps < minRateBps) interestRateBps = minRateBps;
        if (interestRateBps > maxRateBps) interestRateBps = maxRateBps;
    }
}
