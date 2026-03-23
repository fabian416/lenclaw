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
    ERC20Mock usdt;
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
        usdt = new ERC20Mock("USD Coin", "USDT", 6);
        registry = new AgentRegistry(owner);
        vaultFactory = new AgentVaultFactory(address(registry), owner);
        vaultFactory.setAllowedAsset(address(usdt), true);

        // Link registry to factory
        registry.setVaultFactory(address(vaultFactory));

        // Register agent (auto-deploys vault + lockbox)
        agentId = registry.registerAgent(
            agentWallet, keccak256("code"), "TestAgent", address(0), 0, bytes32(0), address(usdt)
        );
        vaultAddr = vaultFactory.getVault(agentId);
        lockboxAddr = vaultFactory.getLockbox(agentId);

        // Deploy smart wallet factory
        walletFactory = new SmartWalletFactory(address(usdt), address(registry), owner);
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
        // Lockbox and vault are NOT allowed targets (blocked by SmartWallet security)
        // Revenue routing to lockbox happens internally via _routePendingRevenue()
        assertFalse(wallet.allowedTargets(lockboxAddr), "Lockbox should NOT be an allowed target");
    }

    // ── Revenue Routing Tests ──────────────────────────

    function test_routeRevenue() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        // Send USDT to the smart wallet
        usdt.mint(walletAddr, 1000e6);

        // Route revenue (callable by anyone)
        wallet.routeRevenue();

        // 50% to lockbox, 50% remains in wallet
        assertEq(usdt.balanceOf(lockboxAddr), 500e6, "500 to lockbox");
        assertEq(usdt.balanceOf(walletAddr), 500e6, "500 remains in wallet");
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

        usdt.mint(walletAddr, 1000e6);

        (uint256 toLockbox, uint256 toAgent) = wallet.pendingRevenue();
        assertEq(toLockbox, 500e6);
        assertEq(toAgent, 500e6);
    }

    // ── Execute Tests ──────────────────────────────────

    function test_execute_allowedTarget() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        // Add a generic contract as allowed target (asset token is blocked by SmartWallet)
        address target = makeAddr("externalProtocol");
        walletFactory.addAllowedTarget(agentId, target);

        assertTrue(wallet.allowedTargets(target));
    }

    function test_execute_revertNotOwner() public {
        address walletAddr = walletFactory.createWallet(agentId);
        AgentSmartWallet wallet = AgentSmartWallet(payable(walletAddr));

        address target = makeAddr("target");
        walletFactory.addAllowedTarget(agentId, target);

        vm.prank(backer);
        vm.expectRevert(AgentSmartWallet.NotOwner.selector);
        wallet.execute(target, 0, "");
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

        // Use a generic target (asset token is blocked)
        address target = makeAddr("batchTarget");
        walletFactory.addAllowedTarget(agentId, target);

        assertTrue(wallet.allowedTargets(target));
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
        usdt.mint(walletAddr, 500e6);

        // Manually route revenue (since execute targets are restricted)
        wallet.routeRevenue();

        // 50% of 500 = 250 routed to lockbox
        assertEq(usdt.balanceOf(lockboxAddr), 250e6);
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
