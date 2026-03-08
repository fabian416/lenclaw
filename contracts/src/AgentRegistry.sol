// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";
import {IAgentVaultFactory} from "./interfaces/IAgentVaultFactory.sol";

/// @title AgentRegistry - ERC-8004 inspired AI Agent identity registry
/// @notice Assigns ERC-721 identities to AI agents with reputation tracking and code verification.
///         On registration, automatically deploys an individual AgentVault via the factory.
contract AgentRegistry is ERC721, Ownable, IAgentRegistry {
    // Agent category constants
    bytes32 public constant CATEGORY_TRADING = keccak256("TRADING");
    bytes32 public constant CATEGORY_CONTENT = keccak256("CONTENT");
    bytes32 public constant CATEGORY_ORACLE = keccak256("ORACLE");
    bytes32 public constant CATEGORY_DEFI = keccak256("DEFI");
    bytes32 public constant CATEGORY_NFT = keccak256("NFT");

    uint256 private _nextAgentId = 1;

    mapping(uint256 => AgentProfile) private _agents;
    mapping(address => uint256) private _walletToAgent;

    address public protocol;
    IAgentVaultFactory public vaultFactory;

    modifier onlyProtocol() {
        require(msg.sender == protocol || msg.sender == owner(), "AgentRegistry: not protocol");
        _;
    }

    constructor(address _owner) ERC721("Lenclaw Agent", "lcAGENT") Ownable(_owner) {
        protocol = _owner;
    }

    function setProtocol(address _protocol) external onlyOwner {
        protocol = _protocol;
    }

    function setVaultFactory(address _factory) external onlyOwner {
        require(_factory != address(0), "AgentRegistry: zero factory");
        vaultFactory = IAgentVaultFactory(_factory);
    }

    function registerAgent(
        address agentWallet,
        bytes32 codeHash,
        string calldata metadata,
        address externalToken,
        uint256 externalProtocolId,
        bytes32 agentCategory
    ) external returns (uint256) {
        require(agentWallet != address(0), "AgentRegistry: zero address");
        require(_walletToAgent[agentWallet] == 0, "AgentRegistry: already registered");

        uint256 agentId = _nextAgentId++;

        _agents[agentId] = AgentProfile({
            wallet: agentWallet,
            codeHash: codeHash,
            metadata: metadata,
            reputationScore: 500, // Start at 500/1000
            codeVerified: false,
            lockbox: address(0),
            vault: address(0),
            registeredAt: block.timestamp,
            externalToken: externalToken,
            externalProtocolId: externalProtocolId,
            agentCategory: agentCategory
        });

        _walletToAgent[agentWallet] = agentId;
        _mint(agentWallet, agentId);

        emit AgentRegistered(agentId, agentWallet, codeHash);

        // Auto-deploy vault if factory is set
        if (address(vaultFactory) != address(0)) {
            address vault = vaultFactory.createVault(agentId);
            _agents[agentId].vault = vault;
            emit VaultSet(agentId, vault);
        }

        return agentId;
    }

    function updateReputation(uint256 agentId, uint256 score) external onlyProtocol {
        require(_ownerOf(agentId) != address(0), "AgentRegistry: agent not found");
        require(score <= 1000, "AgentRegistry: score out of range");

        uint256 oldScore = _agents[agentId].reputationScore;
        _agents[agentId].reputationScore = score;

        emit ReputationUpdated(agentId, oldScore, score);
    }

    function verifyCode(uint256 agentId, bytes32 newCodeHash, bytes calldata attestation) external onlyProtocol {
        require(_ownerOf(agentId) != address(0), "AgentRegistry: agent not found");
        require(attestation.length > 0, "AgentRegistry: empty attestation");

        _agents[agentId].codeHash = newCodeHash;
        _agents[agentId].codeVerified = true;

        emit CodeVerified(agentId, newCodeHash);
    }

    function setLockbox(uint256 agentId, address lockbox) external onlyProtocol {
        require(_ownerOf(agentId) != address(0), "AgentRegistry: agent not found");
        require(lockbox != address(0), "AgentRegistry: zero lockbox");

        _agents[agentId].lockbox = lockbox;

        emit LockboxSet(agentId, lockbox);
    }

    function setVault(uint256 agentId, address vault) external onlyProtocol {
        require(_ownerOf(agentId) != address(0), "AgentRegistry: agent not found");
        require(vault != address(0), "AgentRegistry: zero vault");

        _agents[agentId].vault = vault;

        emit VaultSet(agentId, vault);
    }

    function setExternalIdentity(uint256 agentId, address externalToken, uint256 externalProtocolId)
        external
        onlyProtocol
    {
        require(_ownerOf(agentId) != address(0), "AgentRegistry: agent not found");

        _agents[agentId].externalToken = externalToken;
        _agents[agentId].externalProtocolId = externalProtocolId;

        emit ExternalIdentitySet(agentId, externalToken, externalProtocolId);
    }

    function setAgentCategory(uint256 agentId, bytes32 category) external onlyProtocol {
        require(_ownerOf(agentId) != address(0), "AgentRegistry: agent not found");

        _agents[agentId].agentCategory = category;

        emit AgentCategorySet(agentId, category);
    }

    function getAgent(uint256 agentId) external view returns (AgentProfile memory) {
        require(_ownerOf(agentId) != address(0), "AgentRegistry: agent not found");
        return _agents[agentId];
    }

    function getAgentIdByWallet(address wallet) external view returns (uint256) {
        uint256 agentId = _walletToAgent[wallet];
        require(agentId != 0, "AgentRegistry: wallet not registered");
        return agentId;
    }

    function isRegistered(uint256 agentId) external view returns (bool) {
        return _ownerOf(agentId) != address(0);
    }

    function totalAgents() external view returns (uint256) {
        return _nextAgentId - 1;
    }
}
