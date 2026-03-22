// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAgentRegistry {
    struct AgentProfile {
        address wallet;
        address smartWallet;
        bytes32 codeHash;
        string metadata;
        uint256 reputationScore;
        bool codeVerified;
        address lockbox;
        address vault;
        uint256 registeredAt;
        address externalToken;
        uint256 externalProtocolId;
        bytes32 agentCategory;
    }

    event AgentRegistered(uint256 indexed agentId, address indexed wallet, bytes32 codeHash);
    event ReputationUpdated(uint256 indexed agentId, uint256 oldScore, uint256 newScore);
    event CodeVerified(uint256 indexed agentId, bytes32 newCodeHash);
    event LockboxSet(uint256 indexed agentId, address lockbox);
    event VaultSet(uint256 indexed agentId, address vault);
    event SmartWalletSet(uint256 indexed agentId, address smartWallet);
    event ExternalIdentitySet(uint256 indexed agentId, address externalToken, uint256 externalProtocolId);
    event AgentCategorySet(uint256 indexed agentId, bytes32 category);

    function registerAgent(address agentWallet, bytes32 codeHash, string calldata metadata, address externalToken, uint256 externalProtocolId, bytes32 agentCategory, address asset) external returns (uint256);
    function setExternalIdentity(uint256 agentId, address externalToken, uint256 externalProtocolId) external;
    function setAgentCategory(uint256 agentId, bytes32 category) external;
    function setSmartWallet(uint256 agentId, address smartWallet) external;
    function updateReputation(uint256 agentId, uint256 score) external;
    function verifyCode(uint256 agentId, bytes32 newCodeHash, bytes calldata attestation) external;
    function getAgent(uint256 agentId) external view returns (AgentProfile memory);
    function getAgentIdByWallet(address wallet) external view returns (uint256);
    function isRegistered(uint256 agentId) external view returns (bool);
    function setWDKWallet(uint256 agentId, bool _isWDK) external;
    function setAuthorizedFactory(address _factory, bool _authorized) external;
    function agentUsesWDKWallet(uint256 agentId) external view returns (bool);
    function isWDKWallet(uint256 agentId) external view returns (bool);
}
