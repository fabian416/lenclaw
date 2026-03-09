// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ERC20Mock} from "./mocks/ERC20Mock.sol";
import {RevenueLockbox} from "../src/RevenueLockbox.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RevenueLockboxTest is Test {
    ERC20Mock public usdc;
    AgentVault public agentVault;
    RevenueLockbox public lockbox;

    address public agentWallet = makeAddr("agent");
    uint256 public agentId = 1;
    uint256 public repaymentRate = 5000; // 50%

    function setUp() public {
        usdc = new ERC20Mock("USD Coin", "USDC", 6);
        // Deploy a real AgentVault (the factory is msg.sender)
        agentVault = new AgentVault(
            IERC20(address(usdc)), agentId, "Lenclaw Agent 1 USDC", "lcA1USDC", 1000, 500_000e6
        );
        lockbox = new RevenueLockbox(agentWallet, address(agentVault), agentId, address(usdc), repaymentRate, address(0), 0);
        // Wire lockbox on vault (this test contract is the factory)
        agentVault.setLockbox(address(lockbox));
    }

    // ── Constructor ─────────────────────────────────────────────

    function test_constructor_setsImmutables() public view {
        assertEq(lockbox.agent(), agentWallet);
        assertEq(lockbox.vault(), address(agentVault));
        assertEq(lockbox.agentId(), agentId);
        assertEq(address(lockbox.asset()), address(usdc));
        assertEq(lockbox.repaymentRateBps(), repaymentRate);
    }

    function test_constructor_revertsOnZeroAgent() public {
        vm.expectRevert("RevenueLockbox: zero agent");
        new RevenueLockbox(address(0), address(agentVault), agentId, address(usdc), repaymentRate, address(0), 0);
    }

    function test_constructor_revertsOnZeroVault() public {
        vm.expectRevert("RevenueLockbox: zero vault");
        new RevenueLockbox(agentWallet, address(0), agentId, address(usdc), repaymentRate, address(0), 0);
    }

    function test_constructor_revertsOnZeroAsset() public {
        vm.expectRevert("RevenueLockbox: zero asset");
        new RevenueLockbox(agentWallet, address(agentVault), agentId, address(0), repaymentRate, address(0), 0);
    }

    function test_constructor_revertsOnRateTooHigh() public {
        vm.expectRevert("RevenueLockbox: rate out of bounds");
        new RevenueLockbox(agentWallet, address(agentVault), agentId, address(usdc), 10001, address(0), 0);
    }

    function test_constructor_revertsOnRateTooLow() public {
        vm.expectRevert("RevenueLockbox: rate out of bounds");
        new RevenueLockbox(agentWallet, address(agentVault), agentId, address(usdc), 500, address(0), 0);
    }

    // ── Revenue processing ──────────────────────────────────────

    function test_processRevenue_splits50_50() public {
        usdc.mint(address(lockbox), 1000e6);

        vm.prank(agentWallet);
        lockbox.processRevenue();

        assertEq(usdc.balanceOf(address(agentVault)), 500e6, "Vault should get 50%");
        assertEq(usdc.balanceOf(agentWallet), 500e6, "Agent should get 50%");
        assertEq(lockbox.totalRevenueCapture(), 1000e6);
        assertEq(lockbox.totalRepaid(), 500e6);
    }

    function test_processRevenue_100PercentRepayment() public {
        AgentVault v2 = new AgentVault(
            IERC20(address(usdc)), 2, "Lenclaw Agent 2 USDC", "lcA2USDC", 1000, 500_000e6
        );
        RevenueLockbox fullRepay = new RevenueLockbox(
            agentWallet, address(v2), agentId, address(usdc), 10000, address(0), 0 // 100%
        );
        v2.setLockbox(address(fullRepay)); // Wire lockbox on vault
        usdc.mint(address(fullRepay), 1000e6);

        vm.prank(agentWallet);
        fullRepay.processRevenue();

        assertEq(usdc.balanceOf(address(v2)), 1000e6, "Vault should get 100%");
        assertEq(usdc.balanceOf(agentWallet), 0, "Agent should get 0%");
    }

    function test_processRevenue_zeroRepaymentRate() public {
        AgentVault v3 = new AgentVault(
            IERC20(address(usdc)), 3, "Lenclaw Agent 3 USDC", "lcA3USDC", 1000, 500_000e6
        );
        RevenueLockbox zeroRepay = new RevenueLockbox(
            agentWallet, address(v3), agentId, address(usdc), 0, address(0), 0 // 0%
        );
        v3.setLockbox(address(zeroRepay)); // Wire lockbox on vault
        usdc.mint(address(zeroRepay), 1000e6);

        vm.prank(agentWallet);
        zeroRepay.processRevenue();

        assertEq(usdc.balanceOf(address(v3)), 0, "Vault should get 0%");
        assertEq(usdc.balanceOf(agentWallet), 1000e6, "Agent should get 100%");
    }

    function test_processRevenue_multipleProcessings() public {
        usdc.mint(address(lockbox), 1000e6);
        vm.prank(agentWallet);
        lockbox.processRevenue();

        usdc.mint(address(lockbox), 2000e6);
        vm.prank(agentWallet);
        lockbox.processRevenue();

        assertEq(lockbox.totalRevenueCapture(), 3000e6);
        assertEq(lockbox.totalRepaid(), 1500e6);
        assertEq(usdc.balanceOf(address(agentVault)), 1500e6);
        assertEq(usdc.balanceOf(agentWallet), 1500e6);
    }

    function test_processRevenue_onlyAgentOrVault() public {
        usdc.mint(address(lockbox), 1000e6);

        // Random caller should be blocked
        address randomCaller = makeAddr("randomKeeper");
        vm.prank(randomCaller);
        vm.expectRevert("RevenueLockbox: not authorized");
        lockbox.processRevenue();

        // Agent can call
        vm.prank(agentWallet);
        lockbox.processRevenue();

        assertEq(usdc.balanceOf(address(agentVault)), 500e6, "Vault should get 50%");
        assertEq(usdc.balanceOf(agentWallet), 500e6, "Agent should get 50%");
    }

    function test_processRevenue_revertsWhenNoBalance() public {
        vm.prank(agentWallet);
        vm.expectRevert("RevenueLockbox: no revenue");
        lockbox.processRevenue();
    }

    // ── Pending repayment ───────────────────────────────────────

    function test_pendingRepayment_calculatesCorrectly() public {
        usdc.mint(address(lockbox), 1000e6);

        assertEq(lockbox.pendingRepayment(), 500e6);
    }

    function test_pendingRepayment_zeroWhenEmpty() public view {
        assertEq(lockbox.pendingRepayment(), 0);
    }

    // ── Credit line ─────────────────────────────────────────────

    function test_setCreditLine_onlyVault() public {
        address cl = makeAddr("creditLine");

        vm.prank(address(agentVault));
        lockbox.setCreditLine(cl);

        assertEq(lockbox.creditLine(), cl);
    }

    function test_setCreditLine_canOnlyBeSetOnce() public {
        address cl = makeAddr("creditLine");

        vm.prank(address(agentVault));
        lockbox.setCreditLine(cl);

        vm.prank(address(agentVault));
        vm.expectRevert("RevenueLockbox: credit line already set");
        lockbox.setCreditLine(makeAddr("anotherCL"));
    }

    function test_setCreditLine_revertsForNonVault() public {
        vm.prank(agentWallet);
        vm.expectRevert("RevenueLockbox: not vault");
        lockbox.setCreditLine(makeAddr("creditLine"));
    }

    // ── ETH receive ─────────────────────────────────────────────

    function test_receivesETH() public {
        vm.deal(address(this), 1 ether);
        (bool success,) = address(lockbox).call{value: 1 ether}("");
        assertTrue(success, "Should accept ETH");
    }

    // ── Immutability ────────────────────────────────────────────

    function test_immutableFields_cannotBeChanged() public view {
        assertEq(lockbox.agent(), agentWallet);
        assertEq(lockbox.vault(), address(agentVault));
        assertEq(lockbox.agentId(), agentId);
    }

    // ── Fuzz tests ──────────────────────────────────────────────

    function testFuzz_processRevenue_splitIsCorrect(uint256 amount, uint256 rateBps) public {
        amount = bound(amount, 1, 1_000_000_000e6);
        // Rate must be 0 or within MIN_REPAYMENT_RATE_BPS (1000) to MAX (10000)
        rateBps = bound(rateBps, 0, 10000);
        if (rateBps > 0 && rateBps < 1000) rateBps = 1000;

        AgentVault fuzzVault = new AgentVault(
            IERC20(address(usdc)), 99, "Fuzz Vault", "lcFUZZ", 0, type(uint256).max
        );
        RevenueLockbox lb = new RevenueLockbox(
            agentWallet, address(fuzzVault), agentId, address(usdc), rateBps, address(0), 0
        );
        fuzzVault.setLockbox(address(lb)); // Wire lockbox on vault
        usdc.mint(address(lb), amount);

        vm.prank(agentWallet);
        lb.processRevenue();

        uint256 expectedRepayment = (amount * rateBps) / 10000;
        uint256 expectedAgent = amount - expectedRepayment;

        assertEq(usdc.balanceOf(address(fuzzVault)), expectedRepayment);
        assertEq(usdc.balanceOf(agentWallet), expectedAgent);
    }

    // ── Revenue cap (wash revenue defense) ───────────────────────

    function test_processRevenue_capsAtMax() public {
        // Deploy lockbox with 100K USDC cap
        AgentVault capVault = new AgentVault(
            IERC20(address(usdc)), 10, "Cap Vault", "lcCAP", 1000, 500_000e6
        );
        RevenueLockbox capLockbox = new RevenueLockbox(
            agentWallet, address(capVault), 10, address(usdc), repaymentRate, address(0), 100_000e6
        );
        capVault.setLockbox(address(capLockbox));

        // Mint 200K to lockbox (above 100K cap)
        usdc.mint(address(capLockbox), 200_000e6);

        vm.prank(agentWallet);
        capLockbox.processRevenue();

        // Only 100K should have been processed (capped)
        assertEq(capLockbox.totalRevenueCapture(), 100_000e6, "Should only process up to cap");

        // 100K remains in lockbox for next call
        assertEq(usdc.balanceOf(address(capLockbox)), 100_000e6, "Remaining should stay in lockbox");

        // 50% of 100K = 50K to vault, 50K to agent (50% repayment rate)
        assertEq(usdc.balanceOf(address(capVault)), 50_000e6, "Vault gets 50% of capped amount");
        assertEq(usdc.balanceOf(agentWallet), 50_000e6, "Agent gets 50% of capped amount");

        // Process the remaining 100K
        vm.prank(agentWallet);
        capLockbox.processRevenue();

        assertEq(capLockbox.totalRevenueCapture(), 200_000e6, "Total should now be 200K after second process");
        assertEq(usdc.balanceOf(address(capLockbox)), 0, "Lockbox should be empty");
    }
}
