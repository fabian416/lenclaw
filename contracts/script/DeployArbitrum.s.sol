// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LenclawVault} from "../src/LenclawVault.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {AgentCreditLine} from "../src/AgentCreditLine.sol";
import {SeniorTranche} from "../src/SeniorTranche.sol";
import {JuniorTranche} from "../src/JuniorTranche.sol";

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

        // 2. Deploy LenclawVault
        LenclawVault vault = new LenclawVault(IERC20(USDC), owner);
        console.log("LenclawVault:", address(vault));

        // 3. Deploy CreditScorer
        CreditScorer scorer = new CreditScorer(address(registry), owner);
        console.log("CreditScorer:", address(scorer));

        // 4. Deploy AgentCreditLine
        AgentCreditLine creditLine =
            new AgentCreditLine(USDC, address(registry), address(scorer), address(vault), owner);
        console.log("AgentCreditLine:", address(creditLine));

        // 5. Deploy SeniorTranche
        SeniorTranche senior = new SeniorTranche(IERC20(USDC), address(vault), owner);
        console.log("SeniorTranche:", address(senior));

        // 6. Deploy JuniorTranche
        JuniorTranche junior = new JuniorTranche(IERC20(USDC), address(vault), owner);
        console.log("JuniorTranche:", address(junior));

        // 7. Configure: authorize credit line as borrower
        vault.authorizeBorrower(address(creditLine), true);
        console.log("CreditLine authorized as borrower");

        vm.stopBroadcast();

        console.log("--- Arbitrum deployment complete ---");

        // Write deployment addresses to JSON
        string memory json = "deployment";
        vm.serializeAddress(json, "usdc", USDC);
        vm.serializeAddress(json, "agentRegistry", address(registry));
        vm.serializeAddress(json, "lenclawVault", address(vault));
        vm.serializeAddress(json, "creditScorer", address(scorer));
        vm.serializeAddress(json, "agentCreditLine", address(creditLine));
        vm.serializeAddress(json, "seniorTranche", address(senior));
        string memory output = vm.serializeAddress(json, "juniorTranche", address(junior));
        vm.writeJson(output, "./deployments/arbitrum.json");
    }
}
