// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {AgentCreditLine} from "../src/AgentCreditLine.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";

/// @title DeployBase - Base mainnet deployment script
/// @notice Deploys the full Lenclaw protocol suite to Base (chain ID 8453)
contract DeployBase is Script {
    // Base mainnet native USDC
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address owner = vm.envOr("OWNER", deployer);

        console.log("Deploying Lenclaw to Base mainnet");
        console.log("Deployer:", deployer);
        console.log("Owner:", owner);
        console.log("USDC:", USDC);

        vm.startBroadcast(deployerKey);

        // 1. Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry(owner);
        console.log("AgentRegistry:", address(registry));

        // 2. Deploy AgentVaultFactory
        AgentVaultFactory factory = new AgentVaultFactory(USDC, address(registry), owner);
        console.log("AgentVaultFactory:", address(factory));

        // 3. Deploy CreditScorer
        CreditScorer scorer = new CreditScorer(address(registry), owner);
        console.log("CreditScorer:", address(scorer));

        // 4. Deploy AgentCreditLine (uses factory to find per-agent vaults)
        AgentCreditLine creditLine =
            new AgentCreditLine(USDC, address(registry), address(scorer), address(factory), owner);
        console.log("AgentCreditLine:", address(creditLine));

        // 5. Configure: link registry to factory for auto vault deployment
        registry.setVaultFactory(address(factory));
        console.log("Registry linked to VaultFactory");

        vm.stopBroadcast();

        console.log("--- Base deployment complete ---");

        // Write deployment addresses to JSON
        string memory json = "deployment";
        vm.serializeAddress(json, "usdc", USDC);
        vm.serializeAddress(json, "agentRegistry", address(registry));
        vm.serializeAddress(json, "agentVaultFactory", address(factory));
        vm.serializeAddress(json, "creditScorer", address(scorer));
        string memory output = vm.serializeAddress(json, "agentCreditLine", address(creditLine));
        vm.writeJson(output, "./deployments/base.json");
    }
}
