// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {AgentCreditLine} from "../src/AgentCreditLine.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";
import {DutchAuction} from "../src/DutchAuction.sol";
import {RecoveryManager} from "../src/RecoveryManager.sol";
import {LiquidationKeeper} from "../src/LiquidationKeeper.sol";

/// @notice Mock USDC for testnet (Base Sepolia has no official USDC)
contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @title DeployBaseSepolia - Base Sepolia testnet deployment script
/// @notice Deploys the full Lenclaw protocol suite to Base Sepolia (chain ID 84532)
contract DeployBaseSepolia is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address owner = vm.envOr("OWNER", deployer);

        console.log("Deploying Lenclaw to Base Sepolia");
        console.log("Deployer:", deployer);
        console.log("Owner:", owner);

        vm.startBroadcast(deployerKey);

        // 1. Deploy MockUSDC (no official USDC on Sepolia)
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC:", address(usdc));

        // 2. Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry(owner);
        console.log("AgentRegistry:", address(registry));

        // 3. Deploy AgentVaultFactory
        AgentVaultFactory factory = new AgentVaultFactory(address(registry), owner);
        console.log("AgentVaultFactory:", address(factory));

        // 3b. Whitelist MockUSDC as allowed asset
        factory.setAllowedAsset(address(usdc), true);

        // 4. Deploy CreditScorer
        CreditScorer scorer = new CreditScorer(address(registry), owner);
        console.log("CreditScorer:", address(scorer));

        // 5. Deploy AgentCreditLine
        AgentCreditLine creditLine = new AgentCreditLine(address(registry), address(scorer), address(factory), owner);
        console.log("AgentCreditLine:", address(creditLine));

        // 6. Deploy DutchAuction
        DutchAuction dutchAuction = new DutchAuction(address(usdc), owner, owner);
        console.log("DutchAuction:", address(dutchAuction));

        // 7. Deploy RecoveryManager
        RecoveryManager recoveryManager =
            new RecoveryManager(address(usdc), address(dutchAuction), address(registry), address(factory), owner);
        console.log("RecoveryManager:", address(recoveryManager));

        // 8. Deploy LiquidationKeeper
        LiquidationKeeper keeper = new LiquidationKeeper(
            address(creditLine), address(registry), address(usdc), address(recoveryManager), owner
        );
        console.log("LiquidationKeeper:", address(keeper));

        // 9. Wire everything
        dutchAuction.setRecoveryManager(address(recoveryManager));
        recoveryManager.setCreditLine(address(creditLine));
        recoveryManager.setKeeper(address(keeper));
        creditLine.setRecoveryManager(address(recoveryManager));
        scorer.setCreditLine(address(creditLine));
        factory.setCreditLine(address(creditLine));
        factory.setRecoveryManager(address(recoveryManager));

        // 10. Set treasury address (owner acts as treasury initially)
        factory.setTreasury(owner);

        // 11. Set protocol address on registry (owner acts as protocol initially)
        registry.setProtocol(owner);

        // 12. Link registry to factory for auto vault deployment
        registry.setVaultFactory(address(factory));
        console.log("Registry linked to VaultFactory");

        // 13. Mint test USDC to deployer (1M for testing)
        usdc.mint(deployer, 1_000_000e6);
        console.log("Minted 1M USDC to deployer");

        // 14. Fund LiquidationKeeper bounty pool (10K USDC for test bounties)
        usdc.mint(address(keeper), 10_000e6);
        console.log("Funded LiquidationKeeper with 10K USDC");

        vm.stopBroadcast();

        console.log("--- Base Sepolia deployment complete ---");

        // Write deployment addresses to JSON
        string memory json = "deployment";
        vm.serializeAddress(json, "usdc", address(usdc));
        vm.serializeAddress(json, "agentRegistry", address(registry));
        vm.serializeAddress(json, "agentVaultFactory", address(factory));
        vm.serializeAddress(json, "creditScorer", address(scorer));
        vm.serializeAddress(json, "agentCreditLine", address(creditLine));
        vm.serializeAddress(json, "dutchAuction", address(dutchAuction));
        vm.serializeAddress(json, "recoveryManager", address(recoveryManager));
        vm.serializeAddress(json, "liquidationKeeper", address(keeper));
        vm.serializeAddress(json, "deployer", deployer);
        string memory output = vm.serializeAddress(json, "owner", owner);
        vm.writeJson(output, "./deployments/base-sepolia.json");
    }
}
