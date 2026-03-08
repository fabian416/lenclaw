// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {IRevenueLockbox} from "./interfaces/IRevenueLockbox.sol";
import {ICreditScorer} from "./interfaces/ICreditScorer.sol";

/// @title CreditScorer - Multi-source on-chain credit calculation for AI agents
/// @notice Calculates credit lines and interest rates based on weighted scoring:
///         35% revenue, 10% time-in-protocol, 15% revenue velocity, 15% reputation,
///         10% code verification, 15% smart wallet usage
contract CreditScorer is Ownable, ICreditScorer {
    IAgentRegistry public immutable registry;

    uint256 public minCreditLine = 100e6;     // 100 USDC (6 decimals)
    uint256 public maxCreditLine = 100_000e6; // 100,000 USDC
    uint256 public minRateBps = 300;          // 3% APR
    uint256 public maxRateBps = 2500;         // 25% APR

    // Revenue multiplier: credit line = revenue * multiplier / 100
    uint256 public revenueMultiplier = 300; // 3x revenue

    // Smart wallet factory for tier check
    address public smartWalletFactory;

    // Scoring weights (out of 100)
    uint256 public constant WEIGHT_REVENUE = 35;
    uint256 public constant WEIGHT_TIME = 10;
    uint256 public constant WEIGHT_VELOCITY = 15;
    uint256 public constant WEIGHT_REPUTATION = 15;
    uint256 public constant WEIGHT_CODE_VERIFIED = 10;
    uint256 public constant WEIGHT_SMART_WALLET = 15;

    // Time thresholds for maturity scoring
    uint256 public constant MAX_MATURITY_DAYS = 180; // 6 months for full maturity score

    constructor(address _registry, address _owner) Ownable(_owner) {
        registry = IAgentRegistry(_registry);
    }

    function setSmartWalletFactory(address _factory) external onlyOwner {
        smartWalletFactory = _factory;
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

    /// @notice Calculate credit line for an agent using weighted multi-source scoring
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

        // Get revenue data from lockbox
        IRevenueLockbox lockbox = IRevenueLockbox(profile.lockbox);
        uint256 totalRevenue = lockbox.totalRevenueCapture();

        // --- Weighted composite score (0-100) ---

        // 1. Revenue score (40%): based on revenue * multiplier
        uint256 baseCreditLine = (totalRevenue * revenueMultiplier) / 100;
        uint256 revenueScore;
        if (baseCreditLine >= maxCreditLine) {
            revenueScore = 100;
        } else if (baseCreditLine <= minCreditLine) {
            revenueScore = 0;
        } else {
            revenueScore = ((baseCreditLine - minCreditLine) * 100) / (maxCreditLine - minCreditLine);
        }

        // 2. Time-in-protocol score (15%): days since registration, max 180 days
        uint256 timeScore;
        if (profile.registeredAt > 0 && block.timestamp > profile.registeredAt) {
            uint256 daysActive = (block.timestamp - profile.registeredAt) / 1 days;
            if (daysActive >= MAX_MATURITY_DAYS) {
                timeScore = 100;
            } else {
                timeScore = (daysActive * 100) / MAX_MATURITY_DAYS;
            }
        }

        // 3. Revenue velocity score (20%): revenue per day of activity
        uint256 velocityScore;
        if (profile.registeredAt > 0 && block.timestamp > profile.registeredAt) {
            uint256 daysActive = (block.timestamp - profile.registeredAt) / 1 days;
            if (daysActive > 0) {
                uint256 dailyRevenue = totalRevenue / daysActive;
                // Scale: $100/day = score 100 (in 6 decimal USDC)
                if (dailyRevenue >= 100e6) {
                    velocityScore = 100;
                } else {
                    velocityScore = (dailyRevenue * 100) / 100e6;
                }
            }
        }

        // 4. Reputation score (15%): 0-1000 mapped to 0-100
        uint256 reputationScore = (profile.reputationScore * 100) / 1000;

        // 5. Code verification score (10%): binary 0 or 100
        uint256 codeScore = profile.codeVerified ? 100 : 0;

        // 6. Smart wallet score (15%): binary 0 or 100
        uint256 smartWalletScore;
        if (smartWalletFactory != address(0)) {
            (bool ok, bytes memory data) = smartWalletFactory.staticcall(
                abi.encodeWithSignature("wallets(uint256)", agentId)
            );
            if (ok && data.length >= 32) {
                address wallet = abi.decode(data, (address));
                if (wallet != address(0)) {
                    smartWalletScore = 100;
                }
            }
        }

        // --- Composite weighted score ---
        uint256 compositeScore = (revenueScore * WEIGHT_REVENUE + timeScore * WEIGHT_TIME
            + velocityScore * WEIGHT_VELOCITY + reputationScore * WEIGHT_REPUTATION
            + codeScore * WEIGHT_CODE_VERIFIED + smartWalletScore * WEIGHT_SMART_WALLET) / 100;

        // --- Credit limit from composite score ---
        creditLimit = minCreditLine + (compositeScore * (maxCreditLine - minCreditLine)) / 100;

        // Clamp credit limit
        if (creditLimit < minCreditLine) creditLimit = minCreditLine;
        if (creditLimit > maxCreditLine) creditLimit = maxCreditLine;

        // --- Interest rate: inversely proportional to composite score ---
        // Higher score = lower rate
        uint256 rateSpread = maxRateBps - minRateBps;
        uint256 rateDiscount = (compositeScore * rateSpread) / 100;
        interestRateBps = maxRateBps - rateDiscount;

        // Clamp rate
        if (interestRateBps < minRateBps) interestRateBps = minRateBps;
        if (interestRateBps > maxRateBps) interestRateBps = maxRateBps;
    }
}
