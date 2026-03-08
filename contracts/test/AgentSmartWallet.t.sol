// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20Mock} from "./mocks/ERC20Mock.sol";
import {AgentSmartWallet} from "../src/AgentSmartWallet.sol";
import {SmartWalletFactory} from "../src/SmartWalletFactory.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";
import {AgentVault} from "../src/AgentVault.sol";

contract AgentSmartWalletTest is Test {
    ERC20Mock usdc;
    AgentRegistry registry;
    AgentVaultFactory vaultFactory;
    SmartWalletFactory walletFactory;

    address owner = address(this);
    address agentWallet = makeAddr("agentWallet");
    address backer = makeAddr("backer");

    uint256 agentId;
    address vaultAddr;
    address lockboxAddr;

    function setUp() public {
        usdc = new ERC20Mock("USD Coin", "USDC", 6);
        registry = new AgentRegistry(owner);
        vaultFactory = new AgentVaultFactory(address(usdc), address(registry), owner);

        // Link registry to factory
        registry.setVaultFactory(address(vaultFactory));

        // Register agent (auto-deploys vault + lockbox)
        agentId = registry.registerAgent(agentWallet, keccak256("code"), "TestAgent", address(0), 0, bytes32(0));
        vaultAddr = vaultFactory.getVault(agentId);
        lockboxAddr = vaultFactory.getLockbox(agentId);

        // Deploy smart wallet factory
        walletFactory = new SmartWalletFactory(address(usdc), address(registry), owner);
    }

    // ── Factory Tests ──────────────────────────────────

    function test_createWallet() public {
        address wallet = walletFactory.createWallet(agentId);
        assertTrue(wallet != address(0), "Wallet should be deployed");
        assertEq(walletFactory.getWallet(agentId), wallet);
        assertTrue(walletFactory.isSmartWallet(wallet));
    }

    function test_createWallet_agentOwnerCanCreate() public {
        vm.prank(agentWallet);
        address wallet = walletFactory.createWallet(agentId);
        assertTrue(wallet != address(0));
    }

    function test_createWallet_revertDuplicate() public {
        walletFactory.createWallet(agentId);
        vm.expectRevert("wallet exists");
        walletFactory.createWallet(agentId);
    }

    function test_createWallet_revertUnauthorized() public {
        vm.prank(backer);
        vm.expectRevert("not authorized");
        walletFactory.createWallet(agentId);
    }

    function test_walletImmutables() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        assertEq(wallet.owner(), agentWallet);
        assertEq(wallet.protocol(), address(walletFactory));
        assertEq(wallet.lockbox(), lockboxAddr);
        assertEq(wallet.agentId(), agentId);
        assertEq(wallet.repaymentRateBps(), 5000); // default 50%
    }

    function test_defaultAllowedTargets() public {
        // Add a default target
        address target = makeAddr("defaultTarget");
        walletFactory.addDefaultTarget(target);

        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        assertTrue(wallet.allowedTargets(target), "Default target should be allowed");
        assertTrue(wallet.allowedTargets(lockboxAddr), "Lockbox should be allowed");
        assertTrue(wallet.allowedTargets(vaultAddr), "Vault should be allowed");
    }

    // ── Revenue Routing Tests ──────────────────────────

    function test_routeRevenue() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        // Send USDC to the smart wallet
        usdc.mint(walletAddr, 1000e6);

        // Route revenue (callable by anyone)
        wallet.routeRevenue();

        // 50% to lockbox, 50% remains in wallet
        assertEq(usdc.balanceOf(lockboxAddr), 500e6, "500 to lockbox");
        assertEq(usdc.balanceOf(walletAddr), 500e6, "500 remains in wallet");
        assertEq(wallet.totalRouted(), 500e6);
    }

    function test_routeRevenue_noBalance() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        // Should not revert with zero balance
        wallet.routeRevenue();
        assertEq(wallet.totalRouted(), 0);
    }

    function test_pendingRevenue() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        usdc.mint(walletAddr, 1000e6);

        (uint256 toLockbox, uint256 toAgent) = wallet.pendingRevenue();
        assertEq(toLockbox, 500e6);
        assertEq(toAgent, 500e6);
    }

    // ── Execute Tests ──────────────────────────────────

    function test_execute_allowedTarget() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        // Add USDC as allowed target
        walletFactory.addAllowedTarget(agentId, address(usdc));

        usdc.mint(walletAddr, 1000e6);

        // Execute a USDC transfer through the smart wallet
        bytes memory data = abi.encodeWithSignature("transfer(address,uint256)", backer, 100e6);

        vm.prank(agentWallet);
        wallet.execute(address(usdc), 0, data);

        // Revenue was routed first (500 to lockbox), then 100 sent to backer
        // Wallet had 1000, routed 500 to lockbox, has 500, then transferred 100 to backer
        assertEq(usdc.balanceOf(lockboxAddr), 500e6);
        assertEq(usdc.balanceOf(backer), 100e6);
        assertEq(usdc.balanceOf(walletAddr), 400e6);
    }

    function test_execute_revertNotOwner() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        walletFactory.addAllowedTarget(agentId, makeAddr("target"));

        vm.prank(backer);
        vm.expectRevert(AgentSmartWallet.NotOwner.selector);
        wallet.execute(makeAddr("target"), 0, "");
    }

    function test_execute_revertTargetNotAllowed() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        address blockedTarget = makeAddr("blocked");

        vm.prank(agentWallet);
        vm.expectRevert(AgentSmartWallet.TargetNotAllowed.selector);
        wallet.execute(blockedTarget, 0, "");
    }

    // ── Batch Execute Tests ────────────────────────────

    function test_executeBatch() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        // USDC is the allowed target
        walletFactory.addAllowedTarget(agentId, address(usdc));

        usdc.mint(walletAddr, 2000e6);

        address[] memory targets = new address[](2);
        targets[0] = address(usdc);
        targets[1] = address(usdc);

        uint256[] memory values = new uint256[](2);
        values[0] = 0;
        values[1] = 0;

        bytes[] memory datas = new bytes[](2);
        datas[0] = abi.encodeWithSignature("transfer(address,uint256)", backer, 100e6);
        datas[1] = abi.encodeWithSignature("transfer(address,uint256)", owner, 200e6);

        vm.prank(agentWallet);
        wallet.executeBatch(targets, values, datas);

        // Revenue routed first: 2000 * 50% = 1000 to lockbox, 1000 remains
        // Then 100 to backer + 200 to owner = 300
        assertEq(usdc.balanceOf(lockboxAddr), 1000e6);
        assertEq(usdc.balanceOf(backer), 100e6);
        assertEq(usdc.balanceOf(owner), 200e6);
        assertEq(usdc.balanceOf(walletAddr), 700e6);
    }

    // ── Admin Tests ────────────────────────────────────

    function test_setRepaymentRate() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        walletFactory.setWalletRepaymentRate(agentId, 7000);
        assertEq(wallet.repaymentRateBps(), 7000);
    }

    function test_addRemoveAllowedTarget() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        address target = makeAddr("newTarget");

        walletFactory.addAllowedTarget(agentId, target);
        assertTrue(wallet.allowedTargets(target));

        walletFactory.removeAllowedTarget(agentId, target);
        assertFalse(wallet.allowedTargets(target));
    }

    function test_onlyProtocolCanSetTarget() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        vm.prank(agentWallet);
        vm.expectRevert(AgentSmartWallet.NotProtocol.selector);
        wallet.setAllowedTarget(makeAddr("target"), true);
    }

    function test_onlyProtocolCanSetRate() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        vm.prank(agentWallet);
        vm.expectRevert(AgentSmartWallet.NotProtocol.selector);
        wallet.setRepaymentRate(8000);
    }

    // ── Auto-routing on Execute Tests ──────────────────

    function test_executeAutoRoutesBeforeCall() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        // Fund wallet with revenue
        usdc.mint(walletAddr, 500e6);

        // Execute a no-op call to lockbox (allowed by default)
        // The revenue should still be routed
        vm.prank(agentWallet);
        wallet.execute(lockboxAddr, 0, "");

        // 50% of 500 = 250 routed to lockbox
        assertEq(usdc.balanceOf(lockboxAddr), 250e6);
        assertEq(wallet.totalRouted(), 250e6);
    }

    // ── Receive ETH Test ───────────────────────────────

    function test_receiveETH() public {
        address walletAddr = walletFactory.createWallet(agentId);
        vm.deal(owner, 1 ether);
        (bool success,) = walletAddr.call{value: 1 ether}("");
        assertTrue(success);
        assertEq(walletAddr.balance, 1 ether);
    }
}
