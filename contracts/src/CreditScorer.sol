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

    // Minimum average revenue per epoch to count toward consistency (50 USDC)
    uint256 public minEpochRevenue = 50e6;

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
        uint256 _revenueMultiplier,
        uint256 _minEpochRevenue
    ) external onlyOwner {
        require(_minCreditLine <= _maxCreditLine, "CreditScorer: invalid credit range");
        require(_minRateBps <= _maxRateBps, "CreditScorer: invalid rate range");
        require(_maxRateBps <= 10000, "CreditScorer: rate too high");

        minCreditLine = _minCreditLine;
        maxCreditLine = _maxCreditLine;
        minRateBps = _minRateBps;
        maxRateBps = _maxRateBps;
        revenueMultiplier = _revenueMultiplier;
        minEpochRevenue = _minEpochRevenue;

        emit ParametersUpdated(_minCreditLine, _maxCreditLine, _minRateBps, _maxRateBps);
    }

    /// @notice Get the composite credit score (0-100) for an agent
    /// @param agentId The agent's NFT ID
    /// @return compositeScore Weighted score from 0 to 100
    function getCompositeScore(uint256 agentId) external view returns (uint256 compositeScore) {
        compositeScore = _computeCompositeScore(agentId);
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
        uint256 compositeScore = _computeCompositeScore(agentId);

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

    /// @dev Internal: compute the composite credit score (0-100) from on-chain data
    /// Uses sub-functions to avoid stack-too-deep
    function _computeCompositeScore(uint256 agentId) internal view returns (uint256) {
        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        require(profile.lockbox != address(0), "CreditScorer: no lockbox");

        IRevenueLockbox lockbox = IRevenueLockbox(profile.lockbox);
        uint256 totalRevenue = lockbox.totalRevenueCapture();

        uint256 epochsElapsed = lockbox.currentEpoch() + 1; // +1 because epoch 0 counts
        uint256 revenueScore = _scoreRevenue(totalRevenue, epochsElapsed);
        uint256 consistencyScore = _scoreConsistency(lockbox, totalRevenue);
        uint256 creditHistoryScore = _scoreCreditHistory(agentId);
        uint256 timeScore = _scoreTime(profile.registeredAt);
        uint256 debtRatioScore = _scoreDebtRatio(agentId, totalRevenue);

        return (
            revenueScore * WEIGHT_REVENUE
            + consistencyScore * WEIGHT_CONSISTENCY
            + creditHistoryScore * WEIGHT_CREDIT_HISTORY
            + timeScore * WEIGHT_TIME
            + debtRatioScore * WEIGHT_DEBT_RATIO
        ) / 100;
    }

    function _scoreRevenue(uint256 totalRevenue, uint256 epochsElapsed) internal view returns (uint256) {
        // Use average revenue per epoch, not total lifetime, to dampen flash-loan spikes
        uint256 avgRevenue = epochsElapsed > 0 ? totalRevenue / epochsElapsed : totalRevenue;
        uint256 baseCreditLine = (avgRevenue * revenueMultiplier) / 100;
        if (baseCreditLine >= maxCreditLine) return 100;
        if (baseCreditLine <= minCreditLine) return 0;
        return ((baseCreditLine - minCreditLine) * 100) / (maxCreditLine - minCreditLine);
    }

    function _scoreConsistency(IRevenueLockbox lockbox, uint256 totalRevenue) internal view returns (uint256 score) {
        uint256 currentEp = lockbox.currentEpoch();
        uint256 epochsActive;
        if (currentEp > 0) {
            epochsActive = lockbox.epochsWithRevenue();
            uint256 totalEpochs = currentEp + 1;
            score = (epochsActive * 100) / totalEpochs;
            if (score > 100) score = 100;
        } else if (totalRevenue > 0) {
            epochsActive = 1;
            score = 50;
        }
        // Penalize low-quality epochs
        if (epochsActive > 0 && totalRevenue / epochsActive < minEpochRevenue) {
            score = score / 2;
        }
    }

    function _scoreCreditHistory(uint256 agentId) internal view returns (uint256 score) {
        if (creditLine == address(0)) return 0;

        (bool ok, bytes memory data) = creditLine.staticcall(
            abi.encodeWithSignature("loansRepaid(uint256)", agentId)
        );
        if (ok && data.length >= 32) {
            uint256 completedLoans = abi.decode(data, (uint256));
            score = completedLoans >= 3 ? 100 : (completedLoans * 100) / 3;
        }

        // Only count credit history if meaningful amounts were borrowed
        (bool okB, bytes memory dataB) = creditLine.staticcall(
            abi.encodeWithSignature("totalAmountBorrowed(uint256)", agentId)
        );
        if (okB && dataB.length >= 32) {
            uint256 totalBorrowed = abi.decode(dataB, (uint256));
            if (totalBorrowed < minCreditLine * 5) {
                score = score / 3;
            }
        }

        // Penalize delinquent/default
        (bool ok2, bytes memory data2) = creditLine.staticcall(
            abi.encodeWithSignature("getStatus(uint256)", agentId)
        );
        if (ok2 && data2.length >= 32) {
            uint8 status = abi.decode(data2, (uint8));
            if (status == 1) score = score / 2;
            if (status == 2) score = 0;
        }
    }

    function _scoreTime(uint256 registeredAt) internal view returns (uint256) {
        if (registeredAt == 0 || block.timestamp <= registeredAt) return 0;
        uint256 daysActive = (block.timestamp - registeredAt) / 1 days;
        if (daysActive >= MAX_MATURITY_DAYS) return 100;
        return (daysActive * 100) / MAX_MATURITY_DAYS;
    }

    function _scoreDebtRatio(uint256 agentId, uint256 totalRevenue) internal view returns (uint256) {
        if (creditLine == address(0) || totalRevenue == 0) return 100;
        (bool ok, bytes memory data) = creditLine.staticcall(
            abi.encodeWithSignature("getOutstanding(uint256)", agentId)
        );
        if (ok && data.length >= 32) {
            uint256 outstanding = abi.decode(data, (uint256));
            if (outstanding > 0) {
                uint256 debtPct = (outstanding * 100) / totalRevenue;
                return debtPct >= 100 ? 0 : 100 - debtPct;
            }
        }
        return 100;
    }
}
