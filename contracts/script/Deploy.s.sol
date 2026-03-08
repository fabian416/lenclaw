// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {AgentCreditLine} from "../src/AgentCreditLine.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";

/// @notice Mock USDC for local testing
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract DeployLenclaw is Script {
    function run() external {
        uint256 deployerKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy mock USDC (use real USDC address on mainnet)
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed at:", address(usdc));

        // 2. Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry(deployer);
        console.log("AgentRegistry deployed at:", address(registry));

        // 3. Deploy AgentVaultFactory
        AgentVaultFactory factory = new AgentVaultFactory(address(usdc), address(registry), deployer);
        console.log("AgentVaultFactory deployed at:", address(factory));

        // 4. Deploy CreditScorer
        CreditScorer scorer = new CreditScorer(address(registry), deployer);
        console.log("CreditScorer deployed at:", address(scorer));

        // 5. Deploy AgentCreditLine (now takes factory instead of vault)
        AgentCreditLine creditLine =
            new AgentCreditLine(address(usdc), address(registry), address(scorer), address(factory), deployer);
        console.log("AgentCreditLine deployed at:", address(creditLine));

        // 6. Configure: link registry to factory for auto vault deployment
        registry.setVaultFactory(address(factory));

        // 7. Mint some test USDC to deployer
        usdc.mint(deployer, 1_000_000e6); // 1M USDC

        vm.stopBroadcast();

        console.log("--- Deployment complete ---");
    }
}
