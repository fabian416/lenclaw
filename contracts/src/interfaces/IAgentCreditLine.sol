// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentCreditLine {
    function repay(uint256 agentId, uint256 amount) external;
    function getOutstanding(uint256 agentId) external view returns (uint256);
    function writeDown(uint256 agentId, uint256 amount) external;
    function getStatus(uint256 agentId) external view returns (uint8);
}
