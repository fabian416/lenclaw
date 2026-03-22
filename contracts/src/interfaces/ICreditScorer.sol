// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICreditScorer {
    struct CreditAssessment {
        uint256 creditLimit;
        uint256 interestRateBps;
    }

    event CreditCalculated(uint256 indexed agentId, uint256 creditLimit, uint256 interestRateBps);
    event ParametersUpdated(uint256 minCreditLine, uint256 maxCreditLine, uint256 minRateBps, uint256 maxRateBps);

    function calculateCreditLine(uint256 agentId)
        external
        view
        returns (uint256 creditLimit, uint256 interestRateBps);
    function getCompositeScore(uint256 agentId) external view returns (uint256 compositeScore);
}
