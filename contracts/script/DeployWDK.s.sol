// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {WDKWalletFactory} from "../src/WDKWalletFactory.sol";
import {USDT0Bridge} from "../src/USDT0Bridge.sol";

/// @title DeployWDK - Deploy WDKWalletFactory + USDT0Bridge to Base mainnet
/// @notice Deploys both contracts and wires the factory as authorized in AgentRegistry
contract DeployWDK is Script {
    // ── Already-deployed Base mainnet addresses ──────────────────────────
    address constant USDT = 0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2;
    address constant AGENT_REGISTRY = 0x9B2A14A423067BAdd5a64979E59dED6C7A5681Ea;
    address constant ENTRY_POINT_V06 = 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789;

    // LayerZero endpoint: address(0) for now (no cross-chain in demo)
    address constant LZ_ENDPOINT = address(0);

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address owner = vm.envOr("OWNER", deployer);

        console.log("=== DeployWDK: Base mainnet ===");
        console.log("Deployer:", deployer);
        console.log("Owner:", owner);
        console.log("USDT:", USDT);
        console.log("AgentRegistry:", AGENT_REGISTRY);
        console.log("EntryPoint v0.6:", ENTRY_POINT_V06);

        vm.startBroadcast(deployerKey);

        // 1. Deploy WDKWalletFactory
        //    constructor(address _usdc, address _registry, address _entryPoint, address _owner)
        WDKWalletFactory walletFactory = new WDKWalletFactory(
            USDT,
            AGENT_REGISTRY,
            ENTRY_POINT_V06,
            owner
        );
        console.log("WDKWalletFactory:", address(walletFactory));

        // 2. Deploy USDT0Bridge
        //    constructor(address _usdt0, address _registry, address _lzEndpoint, address _owner)
        USDT0Bridge bridge = new USDT0Bridge(
            USDT,
            AGENT_REGISTRY,
            LZ_ENDPOINT,
            owner
        );
        console.log("USDT0Bridge:", address(bridge));

        // 3. Wire WDKWalletFactory as authorized factory in AgentRegistry
        //    so it can call setSmartWallet() during wallet creation
        (bool success,) = AGENT_REGISTRY.call(
            abi.encodeWithSignature(
                "setAuthorizedFactory(address,bool)",
                address(walletFactory),
                true
            )
        );
        require(success, "Failed to authorize WDKWalletFactory in AgentRegistry");
        console.log("WDKWalletFactory authorized in AgentRegistry");

        vm.stopBroadcast();

        console.log("=== DeployWDK complete ===");
        console.log("WDKWalletFactory:", address(walletFactory));
        console.log("USDT0Bridge:", address(bridge));

        // Write deployment addresses to JSON
        string memory json = "wdk_deployment";
        vm.serializeAddress(json, "wdkWalletFactory", address(walletFactory));
        vm.serializeAddress(json, "usdt0Bridge", address(bridge));
        vm.serializeAddress(json, "usdt", USDT);
        vm.serializeAddress(json, "agentRegistry", AGENT_REGISTRY);
        vm.serializeAddress(json, "entryPoint", ENTRY_POINT_V06);
        vm.serializeAddress(json, "deployer", deployer);
        string memory output = vm.serializeAddress(json, "owner", owner);
        vm.writeJson(output, "./deployments/base-wdk.json");
    }
}
