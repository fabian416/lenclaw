// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentSmartWallet} from "./IAgentSmartWallet.sol";

/// @title IWDKSmartWallet - Interface for WDK (ERC-4337) compatible smart wallets
interface IWDKSmartWallet is IAgentSmartWallet {
    // --- Events ---
    event UserOpValidated(bytes32 indexed userOpHash, address indexed sender, uint256 validationData);
    event WDKBatchExecuted(uint256 indexed count, address indexed sender);
    event EntryPointUpdated(address indexed oldEntryPoint, address indexed newEntryPoint);

    // --- Errors ---
    error NotEntryPoint();
    error InvalidSignatureLength();

    // --- WDK-specific views ---
    function isWDKWallet() external pure returns (bool);
    function wdkVersion() external pure returns (uint256);
    function entryPoint() external view returns (address);
    function getNonce() external view returns (uint256);
}
