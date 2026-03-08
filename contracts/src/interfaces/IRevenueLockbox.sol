// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRevenueLockbox {
    event RevenueReceived(address indexed token, uint256 amount);
    event RevenueProcessed(uint256 repaymentAmount, uint256 agentAmount);
    event RepaymentRateUpdated(uint256 oldRate, uint256 newRate);
    event ETHRescued(address indexed to, uint256 amount);

    function processRevenue() external;
    function setRepaymentRate(uint256 newRateBps) external;
    function adjustRateByDebt(uint256 outstandingDebt, uint256 creditLimit) external;
    function totalRevenueCapture() external view returns (uint256);
    function totalRepaid() external view returns (uint256);
    function pendingRepayment() external view returns (uint256);
    function agentId() external view returns (uint256);
    function agent() external view returns (address);
    function vault() external view returns (address);
    function creditLine() external view returns (address);
    function repaymentRateBps() external view returns (uint256);
}
