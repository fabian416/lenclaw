// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentSmartWallet} from "./AgentSmartWallet.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title SmartWalletFactory - Deploys revenue-routing smart wallets for agents
contract SmartWalletFactory is Ownable {
    address public immutable usdt;
    IAgentRegistry public registry;

    uint256 public defaultRepaymentRateBps = 5000; // 50%

    mapping(uint256 => address) public wallets; // agentId => wallet
    mapping(address => bool) public isSmartWallet; // Quick lookup

    // Default allowed targets (set by protocol)
    address[] public defaultAllowedTargets;

    event SmartWalletCreated(uint256 indexed agentId, address indexed wallet, address indexed owner);
    event DefaultTargetAdded(address indexed target);
    event DefaultTargetRemoved(address indexed target);

    constructor(address _usdt, address _registry, address _owner) Ownable(_owner) {
        require(_usdt != address(0) && _registry != address(0), "zero address");
        usdt = _usdt;
        registry = IAgentRegistry(_registry);
    }

    /// @notice Deploy a smart wallet for an agent. Callable by agent owner or protocol.
    function createWallet(uint256 agentId) external returns (address wallet) {
        require(wallets[agentId] == address(0), "wallet exists");

        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        require(profile.wallet != address(0), "agent not registered");
        require(profile.lockbox != address(0), "no lockbox");

        // Only agent's registered wallet owner or protocol owner can create
        require(msg.sender == profile.wallet || msg.sender == owner(), "not authorized");

        AgentSmartWallet sw = new AgentSmartWallet(
            profile.wallet, // owner = agent operator
            address(this), // protocol = this factory
            profile.lockbox, // lockbox
            usdt,
            agentId,
            defaultRepaymentRateBps
        );

        wallet = address(sw);
        wallets[agentId] = wallet;
        isSmartWallet[wallet] = true;

        // Set default allowed targets (lockbox/vault/asset/self are blocked by SmartWallet)
        for (uint256 i = 0; i < defaultAllowedTargets.length; i++) {
            sw.setAllowedTarget(defaultAllowedTargets[i], true);
        }

        emit SmartWalletCreated(agentId, wallet, profile.wallet);
    }

    /// @notice Add a target to an agent's smart wallet
    function addAllowedTarget(uint256 agentId, address target) external onlyOwner {
        AgentSmartWallet(payable(wallets[agentId])).setAllowedTarget(target, true);
    }

    /// @notice Remove a target from an agent's smart wallet
    function removeAllowedTarget(uint256 agentId, address target) external onlyOwner {
        AgentSmartWallet(payable(wallets[agentId])).setAllowedTarget(target, false);
    }

    /// @notice Update repayment rate for an agent's wallet
    function setWalletRepaymentRate(uint256 agentId, uint256 newRate) external onlyOwner {
        AgentSmartWallet(payable(wallets[agentId])).setRepaymentRate(newRate);
    }

    // --- Default target management ---

    function addDefaultTarget(address target) external onlyOwner {
        defaultAllowedTargets.push(target);
        emit DefaultTargetAdded(target);
    }

    function setDefaultRepaymentRate(uint256 rate) external onlyOwner {
        require(rate <= 10000, "rate too high");
        defaultRepaymentRateBps = rate;
    }

    function setRegistry(address _registry) external onlyOwner {
        registry = IAgentRegistry(_registry);
    }

    function getWallet(uint256 agentId) external view returns (address) {
        return wallets[agentId];
    }
}
