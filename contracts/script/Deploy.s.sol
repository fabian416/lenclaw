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
import {WDKWalletFactory} from "../src/WDKWalletFactory.sol";
import {USDT0Bridge} from "../src/USDT0Bridge.sol";

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
        uint256 deployerKey =
            vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy mock USDC (use real USDC address on mainnet)
        MockUSDC usdc = new MockUSDC();
        console.log("MockUSDC deployed at:", address(usdc));

        // 2. Deploy AgentRegistry
        AgentRegistry registry = new AgentRegistry(deployer);
        console.log("AgentRegistry deployed at:", address(registry));

        // 3. Deploy AgentVaultFactory
        AgentVaultFactory factory = new AgentVaultFactory(address(registry), deployer);
        console.log("AgentVaultFactory deployed at:", address(factory));

        // 3b. Whitelist USDC as allowed asset
        factory.setAllowedAsset(address(usdc), true);

        // 4. Deploy CreditScorer
        CreditScorer scorer = new CreditScorer(address(registry), deployer);
        console.log("CreditScorer deployed at:", address(scorer));

        // 5. Deploy AgentCreditLine (now takes factory instead of vault)
        AgentCreditLine creditLine = new AgentCreditLine(address(registry), address(scorer), address(factory), deployer);
        console.log("AgentCreditLine deployed at:", address(creditLine));

        // 6. Deploy DutchAuction (deployer as placeholder recoveryManager, updated below)
        DutchAuction dutchAuction = new DutchAuction(address(usdc), deployer, deployer);
        console.log("DutchAuction deployed at:", address(dutchAuction));

        // 7. Deploy RecoveryManager
        RecoveryManager recoveryManager =
            new RecoveryManager(address(usdc), address(dutchAuction), address(registry), address(factory), deployer);
        console.log("RecoveryManager deployed at:", address(recoveryManager));

        // 8. Deploy LiquidationKeeper
        LiquidationKeeper keeper = new LiquidationKeeper(
            address(creditLine), address(registry), address(usdc), address(recoveryManager), deployer
        );
        console.log("LiquidationKeeper deployed at:", address(keeper));

        // 9. Wire everything
        dutchAuction.setRecoveryManager(address(recoveryManager));
        recoveryManager.setCreditLine(address(creditLine));
        recoveryManager.setKeeper(address(keeper));
        creditLine.setRecoveryManager(address(recoveryManager));
        factory.setCreditLine(address(creditLine));
        factory.setRecoveryManager(address(recoveryManager));

        // 10. Configure: link registry to factory for auto vault deployment
        registry.setVaultFactory(address(factory));

        // 11. Deploy WDKWalletFactory
        // Use a placeholder EntryPoint for local testing; replace with real ERC-4337 EntryPoint on mainnet
        address entryPointPlaceholder = address(0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789); // ERC-4337 v0.6 EntryPoint
        WDKWalletFactory wdkFactory =
            new WDKWalletFactory(address(usdc), address(registry), entryPointPlaceholder, deployer);
        console.log("WDKWalletFactory deployed at:", address(wdkFactory));

        // 12. Deploy USDT0Bridge
        // Use mock USDC as USDT0 stand-in for local testing; replace with real USDT0 on mainnet
        USDT0Bridge bridge = new USDT0Bridge(address(usdc), address(registry), address(0), deployer);
        console.log("USDT0Bridge deployed at:", address(bridge));

        // 12b. Configure bridge: enable Base Sepolia as supported chain (EID 40245)
        bridge.setSupportedChain(40245, true);

        // 13. Mint some test USDC to deployer
        usdc.mint(deployer, 1_000_000e6); // 1M USDC

        vm.stopBroadcast();

        console.log("--- Deployment complete ---");
    }
}
