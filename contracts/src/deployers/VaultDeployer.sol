// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentVault} from "../AgentVault.sol";

/// @title VaultDeployer - Library that deploys AgentVault instances
/// @notice Extracted from AgentVaultFactory to stay under EIP-170 contract size limit.
///         Called via DELEGATECALL so the vault's factory = the calling contract.
library VaultDeployer {
    function deploy(
        IERC20 asset,
        uint256 agentId,
        string memory name,
        string memory symbol,
        uint256 protocolFeeBps,
        uint256 depositCap
    ) external returns (address) {
        AgentVault vault = new AgentVault(asset, agentId, name, symbol, protocolFeeBps, depositCap);
        return address(vault);
    }
}
