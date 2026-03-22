// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {AgentCreditLine} from "../src/AgentCreditLine.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";
import {DutchAuction} from "../src/DutchAuction.sol";
import {RecoveryManager} from "../src/RecoveryManager.sol";
import {LiquidationKeeper} from "../src/LiquidationKeeper.sol";

/// @title DeployArbitrum - Arbitrum One deployment script
/// @notice Deploys the full Lenclaw protocol suite to Arbitrum (chain ID 42161)
contract DeployArbitrum is Script {
    // Arbitrum One native USDC
    address constant USDC = 0xaf88d065e77c8cC2239327C5EDb3A432268e5831;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address owner = vm.envOr("OWNER", deployer);

        console.log("Deploying Lenclaw to Arbitrum One");
        console.log("Deployer:", deployer);
        console.log("Owner:", owner);
        console.log("USDC:", USDC);

        vm.startBroadcast(deployerKey);

        // 1. Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry(owner);
        console.log("AgentRegistry:", address(registry));

        // 2. Deploy AgentVaultFactory
        AgentVaultFactory factory = new AgentVaultFactory(address(registry), owner);
        console.log("AgentVaultFactory:", address(factory));

        // 2b. Whitelist USDC as allowed asset
        factory.setAllowedAsset(USDC, true);

        // 3. Deploy CreditScorer
        CreditScorer scorer = new CreditScorer(address(registry), owner);
        console.log("CreditScorer:", address(scorer));

        // 4. Deploy AgentCreditLine
        AgentCreditLine creditLine = new AgentCreditLine(address(registry), address(scorer), address(factory), owner);
        console.log("AgentCreditLine:", address(creditLine));

        // 5. Deploy DutchAuction (owner as placeholder recoveryManager, updated below)
        DutchAuction dutchAuction = new DutchAuction(USDC, owner, owner);
        console.log("DutchAuction:", address(dutchAuction));

        // 6. Deploy RecoveryManager
        RecoveryManager recoveryManager =
            new RecoveryManager(USDC, address(dutchAuction), address(registry), address(factory), owner);
        console.log("RecoveryManager:", address(recoveryManager));

        // 7. Deploy LiquidationKeeper
        LiquidationKeeper keeper =
            new LiquidationKeeper(address(creditLine), address(registry), USDC, address(recoveryManager), owner);
        console.log("LiquidationKeeper:", address(keeper));

        // 8. Wire everything
        dutchAuction.setRecoveryManager(address(recoveryManager));
        recoveryManager.setCreditLine(address(creditLine));
        recoveryManager.setKeeper(address(keeper));
        creditLine.setRecoveryManager(address(recoveryManager));
        scorer.setCreditLine(address(creditLine));
        factory.setCreditLine(address(creditLine));
        factory.setRecoveryManager(address(recoveryManager));

        // 9. Configure: link registry to factory
        registry.setVaultFactory(address(factory));
        console.log("Registry linked to VaultFactory");

        vm.stopBroadcast();

        console.log("--- Arbitrum deployment complete ---");

        // Write deployment addresses to JSON
        string memory json = "deployment";
        vm.serializeAddress(json, "usdc", USDC);
        vm.serializeAddress(json, "agentRegistry", address(registry));
        vm.serializeAddress(json, "agentVaultFactory", address(factory));
        vm.serializeAddress(json, "creditScorer", address(scorer));
        vm.serializeAddress(json, "agentCreditLine", address(creditLine));
        vm.serializeAddress(json, "dutchAuction", address(dutchAuction));
        vm.serializeAddress(json, "recoveryManager", address(recoveryManager));
        string memory output = vm.serializeAddress(json, "liquidationKeeper", address(keeper));
        vm.writeJson(output, "./deployments/arbitrum.json");
    }
}
