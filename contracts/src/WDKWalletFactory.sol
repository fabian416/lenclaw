// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {WDKSmartWallet} from "./WDKSmartWallet.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title WDKWalletFactory - Deploys ERC-4337 compatible WDK smart wallets for agents
/// @notice Extends SmartWalletFactory pattern with CREATE2 deterministic deployment.
///         Wallets are deployed at predictable addresses, which is standard for ERC-4337
///         account abstraction flows where the counterfactual address must be known in advance.
contract WDKWalletFactory is Ownable {
    address public immutable usdc;
    IAgentRegistry public registry;
    address public entryPoint;

    uint256 public defaultRepaymentRateBps = 5000; // 50%

    mapping(uint256 => address) public wallets; // agentId => WDK wallet
    mapping(address => bool) public isWDKWallet; // Quick lookup

    // Default allowed targets (set by protocol)
    address[] public defaultAllowedTargets;

    event WDKWalletCreated(uint256 indexed agentId, address indexed wallet, address indexed owner, bytes32 salt);
    event DefaultTargetAdded(address indexed target);
    event EntryPointUpdated(address indexed oldEntryPoint, address indexed newEntryPoint);

    error WalletAlreadyExists(uint256 agentId);
    error AgentNotRegistered();
    error NoLockbox();
    error NotAuthorized();
    error ZeroAddress();

    constructor(address _usdc, address _registry, address _entryPoint, address _owner) Ownable(_owner) {
        require(_usdc != address(0) && _registry != address(0) && _entryPoint != address(0), "zero address");
        usdc = _usdc;
        registry = IAgentRegistry(_registry);
        entryPoint = _entryPoint;
    }

    /// @notice Deploy a WDK smart wallet for an agent using CREATE2.
    ///         The salt is derived from the agentId for deterministic addresses.
    /// @param agentId The agent's ERC-721 ID from AgentRegistry
    /// @return wallet The deployed WDKSmartWallet address
    function createWallet(uint256 agentId) external returns (address wallet) {
        if (wallets[agentId] != address(0)) revert WalletAlreadyExists(agentId);

        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        if (profile.wallet == address(0)) revert AgentNotRegistered();
        if (profile.lockbox == address(0)) revert NoLockbox();

        // Only agent's registered wallet owner or protocol owner can create
        if (msg.sender != profile.wallet && msg.sender != owner()) revert NotAuthorized();

        bytes32 salt = _computeSalt(agentId);

        // Deploy via CREATE2 for deterministic address
        bytes memory bytecode = _getCreationBytecode(profile.wallet, profile.lockbox, agentId, defaultRepaymentRateBps);

        wallet = Create2.deploy(0, salt, bytecode);

        wallets[agentId] = wallet;
        isWDKWallet[wallet] = true;

        // Set default allowed targets
        for (uint256 i = 0; i < defaultAllowedTargets.length; i++) {
            WDKSmartWallet(payable(wallet)).setAllowedTarget(defaultAllowedTargets[i], true);
        }

        // Register wallet in AgentRegistry
        registry.setSmartWallet(agentId, wallet);

        emit WDKWalletCreated(agentId, wallet, profile.wallet, salt);
    }

    /// @notice Compute the counterfactual address of a WDK wallet before deployment.
    ///         Useful for ERC-4337 flows where the address must be known in advance.
    /// @param agentId The agent's ERC-721 ID
    /// @param agentWallet The agent operator's EOA
    /// @param agentLockbox The agent's revenue lockbox
    /// @return The predicted wallet address
    function getAddress(uint256 agentId, address agentWallet, address agentLockbox) external view returns (address) {
        // Validate against registry to prevent address prediction with arbitrary params
        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        require(profile.wallet == agentWallet, "wallet mismatch");
        require(profile.lockbox == agentLockbox, "lockbox mismatch");

        bytes32 salt = _computeSalt(agentId);
        bytes memory bytecode = _getCreationBytecode(agentWallet, agentLockbox, agentId, defaultRepaymentRateBps);
        return Create2.computeAddress(salt, keccak256(bytecode));
    }

    // ─── Wallet admin ───────────────────────────────────────────────────

    /// @notice Add a target to an agent's WDK wallet
    function addAllowedTarget(uint256 agentId, address target) external onlyOwner {
        WDKSmartWallet(payable(wallets[agentId])).setAllowedTarget(target, true);
    }

    /// @notice Remove a target from an agent's WDK wallet
    function removeAllowedTarget(uint256 agentId, address target) external onlyOwner {
        WDKSmartWallet(payable(wallets[agentId])).setAllowedTarget(target, false);
    }

    /// @notice Update repayment rate for an agent's WDK wallet
    function setWalletRepaymentRate(uint256 agentId, uint256 newRate) external onlyOwner {
        WDKSmartWallet(payable(wallets[agentId])).setRepaymentRate(newRate);
    }

    /// @notice Update entry point for a specific agent's WDK wallet
    function setWalletEntryPoint(uint256 agentId, address _entryPoint) external onlyOwner {
        WDKSmartWallet(payable(wallets[agentId])).setEntryPoint(_entryPoint);
    }

    // ─── Factory config ─────────────────────────────────────────────────

    function addDefaultTarget(address target) external onlyOwner {
        defaultAllowedTargets.push(target);
        emit DefaultTargetAdded(target);
    }

    function setDefaultRepaymentRate(uint256 rate) external onlyOwner {
        require(rate <= 10000, "rate too high");
        defaultRepaymentRateBps = rate;
    }

    function setEntryPoint(address _entryPoint) external onlyOwner {
        if (_entryPoint == address(0)) revert ZeroAddress();
        address oldEntryPoint = entryPoint;
        entryPoint = _entryPoint;
        emit EntryPointUpdated(oldEntryPoint, _entryPoint);
    }

    function setRegistry(address _registry) external onlyOwner {
        registry = IAgentRegistry(_registry);
    }

    function getWallet(uint256 agentId) external view returns (address) {
        return wallets[agentId];
    }

    // ─── Internal ───────────────────────────────────────────────────────

    function _computeSalt(uint256 agentId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("WDK_WALLET_V1", agentId));
    }

    function _getCreationBytecode(address _owner, address _lockbox, uint256 _agentId, uint256 _repaymentRateBps)
        internal
        view
        returns (bytes memory)
    {
        return abi.encodePacked(
            type(WDKSmartWallet).creationCode,
            abi.encode(_owner, address(this), _lockbox, usdc, _agentId, _repaymentRateBps, entryPoint)
        );
    }
}
