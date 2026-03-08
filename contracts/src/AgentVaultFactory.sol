// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AgentVault} from "./AgentVault.sol";
import {IAgentRegistry} from "./interfaces/IAgentRegistry.sol";

/// @title AgentVaultFactory - Deploys individual AgentVault per AI agent
/// @notice Factory pattern: when an agent registers, this deploys an ERC-4626 vault
///         specific to that agent. Backers deposit USDC into the agent's vault.
contract AgentVaultFactory is Ownable {
    IERC20 public immutable usdc;
    IAgentRegistry public immutable registry;

    uint256 public defaultProtocolFeeBps = 1000; // 10% of interest
    uint256 public defaultDepositCap = 500_000e6; // 500K USDC default cap

    // agentId => AgentVault address
    mapping(uint256 => address) public vaults;

    // All deployed vaults for enumeration
    address[] public allVaults;

    event VaultCreated(uint256 indexed agentId, address indexed vault, address indexed agentWallet);
    event DefaultProtocolFeeUpdated(uint256 oldFee, uint256 newFee);
    event DefaultDepositCapUpdated(uint256 oldCap, uint256 newCap);

    error VaultAlreadyExists(uint256 agentId);
    error AgentNotRegistered(uint256 agentId);
    error VaultNotFound(uint256 agentId);

    constructor(address _usdc, address _registry, address _owner) Ownable(_owner) {
        usdc = IERC20(_usdc);
        registry = IAgentRegistry(_registry);
    }

    /// @notice Deploy a new AgentVault for a registered agent
    /// @param agentId The agent's ERC-721 ID from AgentRegistry
    /// @return vault The deployed AgentVault address
    function createVault(uint256 agentId) external returns (address vault) {
        if (!registry.isRegistered(agentId)) revert AgentNotRegistered(agentId);
        if (vaults[agentId] != address(0)) revert VaultAlreadyExists(agentId);

        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);

        // Generate unique name/symbol per agent
        string memory name = string.concat("Lenclaw Agent ", _uint2str(agentId), " USDC");
        string memory symbol = string.concat("lcA", _uint2str(agentId), "USDC");

        AgentVault newVault = new AgentVault(
            usdc,
            agentId,
            name,
            symbol,
            defaultProtocolFeeBps,
            defaultDepositCap
        );

        vault = address(newVault);
        vaults[agentId] = vault;
        allVaults.push(vault);

        emit VaultCreated(agentId, vault, profile.wallet);
    }

    /// @notice Set credit line for an agent's vault
    function setVaultCreditLine(uint256 agentId, address creditLine) external onlyOwner {
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).setCreditLine(creditLine);
    }

    /// @notice Update deposit cap for a specific agent's vault
    function setVaultDepositCap(uint256 agentId, uint256 cap) external onlyOwner {
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).setDepositCap(cap);
    }

    /// @notice Update protocol fee for a specific agent's vault
    function setVaultProtocolFee(uint256 agentId, uint256 feeBps) external onlyOwner {
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).setProtocolFeeBps(feeBps);
    }

    /// @notice Collect fees from a specific agent's vault
    function collectVaultFees(uint256 agentId, address to) external onlyOwner {
        address vault = vaults[agentId];
        if (vault == address(0)) revert VaultNotFound(agentId);
        AgentVault(vault).collectFees(to);
    }

    /// @notice Update the default protocol fee for new vaults
    function setDefaultProtocolFeeBps(uint256 _feeBps) external onlyOwner {
        require(_feeBps <= 3000, "AgentVaultFactory: fee too high");
        uint256 oldFee = defaultProtocolFeeBps;
        defaultProtocolFeeBps = _feeBps;
        emit DefaultProtocolFeeUpdated(oldFee, _feeBps);
    }

    /// @notice Update the default deposit cap for new vaults
    function setDefaultDepositCap(uint256 _cap) external onlyOwner {
        uint256 oldCap = defaultDepositCap;
        defaultDepositCap = _cap;
        emit DefaultDepositCapUpdated(oldCap, _cap);
    }

    /// @notice Get total number of deployed vaults
    function totalVaults() external view returns (uint256) {
        return allVaults.length;
    }

    /// @notice Get vault address for an agent
    function getVault(uint256 agentId) external view returns (address) {
        return vaults[agentId];
    }

    /// @dev Convert uint to string for vault naming
    function _uint2str(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
