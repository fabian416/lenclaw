// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentSmartWallet {
    event RevenueRouted(uint256 toLockbox, uint256 remaining);
    event Executed(address indexed target, uint256 value, bool success);
    event AllowedTargetSet(address indexed target, bool allowed);
    event RepaymentRateUpdated(uint256 oldRate, uint256 newRate);

    function owner() external view returns (address);
    function protocol() external view returns (address);
    function lockbox() external view returns (address);
    function agentId() external view returns (uint256);
    function repaymentRateBps() external view returns (uint256);
    function totalRouted() external view returns (uint256);
    function allowedTargets(address target) external view returns (bool);

    function execute(address target, uint256 value, bytes calldata data) external returns (bytes memory);
    function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata datas)
        external
        returns (bytes[] memory);
    function routeRevenue() external;
    function pendingRevenue() external view returns (uint256 toLockbox, uint256 toAgent);
    function setAllowedTarget(address target, bool allowed) external;
    function setRepaymentRate(uint256 newRate) external;
}
