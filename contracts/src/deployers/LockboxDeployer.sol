// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RevenueLockbox} from "../RevenueLockbox.sol";

/// @title LockboxDeployer - Library that deploys RevenueLockbox instances
/// @notice Extracted from AgentVaultFactory to stay under EIP-170 contract size limit.
///         Called via DELEGATECALL so deployment context = the calling contract.
library LockboxDeployer {
    function deploy(
        address agent,
        address vault,
        uint256 agentId,
        address asset,
        uint256 repaymentRateBps,
        address creditLineAddr,
        uint256 maxRevenuePerProcess
    ) external returns (address) {
        RevenueLockbox lockbox =
            new RevenueLockbox(agent, vault, agentId, asset, repaymentRateBps, creditLineAddr, maxRevenuePerProcess);
        return address(lockbox);
    }
}
