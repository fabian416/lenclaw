// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {IRevenueLockbox} from "./interfaces/IRevenueLockbox.sol";
import {ICreditScorer} from "./interfaces/ICreditScorer.sol";

/// @title CreditScorer - On-chain credit calculation for AI agents
/// @notice Calculates credit lines and interest rates based on agent revenue, reputation, and code verification
contract CreditScorer is Ownable, ICreditScorer {
    IAgentRegistry public immutable registry;

    uint256 public minCreditLine = 100e6;     // 100 USDC (6 decimals)
    uint256 public maxCreditLine = 100_000e6; // 100,000 USDC
    uint256 public minRateBps = 300;          // 3% APR
    uint256 public maxRateBps = 2500;         // 25% APR

    // Revenue multiplier: credit line = revenue * multiplier / 100
    uint256 public revenueMultiplier = 300; // 3x revenue

    constructor(address _registry, address _owner) Ownable(_owner) {
        registry = IAgentRegistry(_registry);
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

    /// @notice Calculate credit line for an agent
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

        // Base credit = revenue * multiplier
        uint256 baseCreditLine = (totalRevenue * revenueMultiplier) / 100;

        // Reputation boost: score 0-1000, boost 50%-150%
        uint256 reputationBoost = 50 + (profile.reputationScore * 100) / 1000;
        creditLimit = (baseCreditLine * reputationBoost) / 100;

        // Code verification bonus: +20%
        if (profile.codeVerified) {
            creditLimit = (creditLimit * 120) / 100;
        }

        // Clamp credit limit
        if (creditLimit < minCreditLine) creditLimit = minCreditLine;
        if (creditLimit > maxCreditLine) creditLimit = maxCreditLine;

        // Interest rate: inversely proportional to reputation
        // Higher reputation = lower rate
        // rate = maxRate - (reputation/1000) * (maxRate - minRate)
        uint256 rateSpread = maxRateBps - minRateBps;
        uint256 rateDiscount = (profile.reputationScore * rateSpread) / 1000;
        interestRateBps = maxRateBps - rateDiscount;

        // Code verified agents get additional rate discount
        if (profile.codeVerified) {
            interestRateBps = (interestRateBps * 90) / 100; // 10% rate discount
        }

        // Clamp rate
        if (interestRateBps < minRateBps) interestRateBps = minRateBps;
        if (interestRateBps > maxRateBps) interestRateBps = maxRateBps;
    }
}
