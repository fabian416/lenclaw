// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title AgentRegistry - ERC-8004 inspired AI Agent identity registry
/// @notice Assigns ERC-721 identities to AI agents with reputation tracking and code verification
contract AgentRegistry is ERC721, Ownable, IAgentRegistry {
    uint256 private _nextAgentId = 1;

    mapping(uint256 => AgentProfile) private _agents;
    mapping(address => uint256) private _walletToAgent;

    address public protocol;

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

    function registerAgent(address agentWallet, bytes32 codeHash, string calldata metadata)
        external
        returns (uint256)
    {
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
            registeredAt: block.timestamp
        });

        _walletToAgent[agentWallet] = agentId;
        _mint(agentWallet, agentId);

        emit AgentRegistered(agentId, agentWallet, codeHash);
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
