// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AgentSmartWallet} from "../AgentSmartWallet.sol";

/// @title WalletDeployer - Library that deploys AgentSmartWallet instances
/// @notice Extracted from AgentVaultFactory to stay under EIP-170 contract size limit.
///         Called via DELEGATECALL so deployment context = the calling contract.
library WalletDeployer {
    function deploy(
        address owner,
        address protocol,
        address lockbox,
        address asset,
        uint256 agentId,
        uint256 repaymentRateBps
    ) external returns (address) {
        AgentSmartWallet wallet =
            new AgentSmartWallet(owner, protocol, lockbox, asset, agentId, repaymentRateBps);
        return address(wallet);
    }
}
