// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title LenclawTimelock - TimelockController for Lenclaw governance
/// @notice Wraps OpenZeppelin's TimelockController with a minimum 2-day execution delay.
///         Proposers and executors are configured at deployment (typically the governor contract).
contract LenclawTimelock is TimelockController {
    /// @notice Minimum timelock delay: 2 days
    uint256 public constant MIN_DELAY = 2 days;

    /// @param proposers Addresses allowed to schedule operations (typically the governor)
    /// @param executors Addresses allowed to execute ready operations (address(0) = anyone)
    /// @param admin Optional admin address; set to address(0) to renounce admin immediately
    constructor(address[] memory proposers, address[] memory executors, address admin)
        TimelockController(MIN_DELAY, proposers, executors, admin)
    {}
}
