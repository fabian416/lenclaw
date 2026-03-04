// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentRegistry {
    struct AgentProfile {
        address wallet;
        bytes32 codeHash;
        string metadata;
        uint256 reputationScore;
        bool codeVerified;
        address lockbox;
        uint256 registeredAt;
    }

    event AgentRegistered(uint256 indexed agentId, address indexed wallet, bytes32 codeHash);
    event ReputationUpdated(uint256 indexed agentId, uint256 oldScore, uint256 newScore);
    event CodeVerified(uint256 indexed agentId, bytes32 newCodeHash);
    event LockboxSet(uint256 indexed agentId, address lockbox);

    function registerAgent(address agentWallet, bytes32 codeHash, string calldata metadata) external returns (uint256);
    function updateReputation(uint256 agentId, uint256 score) external;
    function verifyCode(uint256 agentId, bytes32 newCodeHash, bytes calldata attestation) external;
    function getAgent(uint256 agentId) external view returns (AgentProfile memory);
    function getAgentIdByWallet(address wallet) external view returns (uint256);
    function isRegistered(uint256 agentId) external view returns (bool);
}
