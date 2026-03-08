// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
/// @title VerifyContracts - Block explorer verification script
/// @notice Reads deployed addresses from environment and verifies them on block explorers.
///         Run with: forge script VerifyContracts --chain <chain> --verify
///
/// Usage example (Base):
///   CHAIN=base \
///   USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
///   AGENT_REGISTRY=<addr> \
///   AGENT_VAULT_FACTORY=<addr> \
///   CREDIT_SCORER=<addr> \
///   AGENT_CREDIT_LINE=<addr> \
///   OWNER=<addr> \
///   ETHERSCAN_API_KEY=<key> \
///   forge script script/VerifyContracts.s.sol --chain base --verify
contract VerifyContracts is Script {
    function run() external view {
        // Read deployed addresses from environment
        address usdc = vm.envAddress("USDC");
        address agentRegistry = vm.envAddress("AGENT_REGISTRY");
        address agentVaultFactory = vm.envAddress("AGENT_VAULT_FACTORY");
        address creditScorer = vm.envAddress("CREDIT_SCORER");
        address agentCreditLine = vm.envAddress("AGENT_CREDIT_LINE");
        address owner = vm.envAddress("OWNER");

        console.log("=== Lenclaw Contract Verification ===");
        console.log("");
        console.log("USDC:", usdc);
        console.log("Owner:", owner);
        console.log("");
        console.log("--- Deployed Contracts ---");
        console.log("AgentRegistry:", agentRegistry);
        console.log("AgentVaultFactory:", agentVaultFactory);
        console.log("CreditScorer:", creditScorer);
        console.log("AgentCreditLine:", agentCreditLine);
        console.log("");

        console.log("=== Verification Commands ===");
        console.log("Append --chain <chain-name> --etherscan-api-key <key> to each command.");
        console.log("");

        // AgentRegistry: constructor(address _owner)
        _logVerifyCommand("AgentRegistry", agentRegistry, abi.encode(owner));

        // AgentVaultFactory: constructor(address _usdc, address _registry, address _owner)
        _logVerifyCommand("AgentVaultFactory", agentVaultFactory, abi.encode(usdc, agentRegistry, owner));

        // CreditScorer: constructor(address _registry, address _owner)
        _logVerifyCommand("CreditScorer", creditScorer, abi.encode(agentRegistry, owner));

        // AgentCreditLine: constructor(address, address, address, address, address)
        _logVerifyCommand(
            "AgentCreditLine",
            agentCreditLine,
            abi.encode(usdc, agentRegistry, creditScorer, agentVaultFactory, owner)
        );
    }

    function _logVerifyCommand(string memory name, address contractAddr, bytes memory constructorArgs) internal pure {
        console.log("forge verify-contract", contractAddr, name);
        console.log("  --constructor-args", vm.toString(constructorArgs));
        console.log("");
    }
}
