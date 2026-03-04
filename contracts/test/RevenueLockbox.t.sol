// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ERC20Mock} from "./mocks/ERC20Mock.sol";
import {RevenueLockbox} from "../src/RevenueLockbox.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract RevenueLockboxTest is Test {
    ERC20Mock public usdc;
    RevenueLockbox public lockbox;

    address public agentWallet = makeAddr("agent");
    address public vaultAddr = makeAddr("vault");
    uint256 public agentId = 1;
    uint256 public repaymentRate = 5000; // 50%

    function setUp() public {
        usdc = new ERC20Mock("USD Coin", "USDC", 6);
        lockbox = new RevenueLockbox(agentWallet, vaultAddr, agentId, address(usdc), repaymentRate);
    }

    // ── Constructor ─────────────────────────────────────────────

    function test_constructor_setsImmutables() public view {
        assertEq(lockbox.agent(), agentWallet);
        assertEq(lockbox.vault(), vaultAddr);
        assertEq(lockbox.agentId(), agentId);
        assertEq(address(lockbox.usdc()), address(usdc));
        assertEq(lockbox.repaymentRateBps(), repaymentRate);
    }

    function test_constructor_revertsOnZeroAgent() public {
        vm.expectRevert("RevenueLockbox: zero agent");
        new RevenueLockbox(address(0), vaultAddr, agentId, address(usdc), repaymentRate);
    }

    function test_constructor_revertsOnZeroVault() public {
        vm.expectRevert("RevenueLockbox: zero vault");
        new RevenueLockbox(agentWallet, address(0), agentId, address(usdc), repaymentRate);
    }

    function test_constructor_revertsOnZeroUSDC() public {
        vm.expectRevert("RevenueLockbox: zero usdc");
        new RevenueLockbox(agentWallet, vaultAddr, agentId, address(0), repaymentRate);
    }

    function test_constructor_revertsOnRateTooHigh() public {
        vm.expectRevert("RevenueLockbox: rate too high");
        new RevenueLockbox(agentWallet, vaultAddr, agentId, address(usdc), 10001);
    }

    // ── Revenue processing ──────────────────────────────────────

    function test_processRevenue_splits50_50() public {
        usdc.mint(address(lockbox), 1000e6);

        lockbox.processRevenue();

        assertEq(usdc.balanceOf(vaultAddr), 500e6, "Vault should get 50%");
        assertEq(usdc.balanceOf(agentWallet), 500e6, "Agent should get 50%");
        assertEq(lockbox.totalRevenueCapture(), 1000e6);
        assertEq(lockbox.totalRepaid(), 500e6);
    }

    function test_processRevenue_100PercentRepayment() public {
        RevenueLockbox fullRepay = new RevenueLockbox(
            agentWallet, vaultAddr, agentId, address(usdc), 10000 // 100%
        );
        usdc.mint(address(fullRepay), 1000e6);

        fullRepay.processRevenue();

        assertEq(usdc.balanceOf(vaultAddr), 1000e6, "Vault should get 100%");
        assertEq(usdc.balanceOf(agentWallet), 0, "Agent should get 0%");
    }

    function test_processRevenue_zeroRepaymentRate() public {
        RevenueLockbox zeroRepay = new RevenueLockbox(
            agentWallet, vaultAddr, agentId, address(usdc), 0 // 0%
        );
        usdc.mint(address(zeroRepay), 1000e6);

        zeroRepay.processRevenue();

        assertEq(usdc.balanceOf(vaultAddr), 0, "Vault should get 0%");
        assertEq(usdc.balanceOf(agentWallet), 1000e6, "Agent should get 100%");
    }

    function test_processRevenue_multipleProcessings() public {
        usdc.mint(address(lockbox), 1000e6);
        lockbox.processRevenue();

        usdc.mint(address(lockbox), 2000e6);
        lockbox.processRevenue();

        assertEq(lockbox.totalRevenueCapture(), 3000e6);
        assertEq(lockbox.totalRepaid(), 1500e6);
        assertEq(usdc.balanceOf(vaultAddr), 1500e6);
        assertEq(usdc.balanceOf(agentWallet), 1500e6);
    }

    function test_processRevenue_revertsWhenNoBalance() public {
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

        vm.prank(vaultAddr);
        lockbox.setCreditLine(cl);

        assertEq(lockbox.creditLine(), cl);
    }

    function test_setCreditLine_canOnlyBeSetOnce() public {
        address cl = makeAddr("creditLine");

        vm.prank(vaultAddr);
        lockbox.setCreditLine(cl);

        vm.prank(vaultAddr);
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
        // Verify immutable fields are set correctly and cannot change
        // (Solidity immutables are compile-time enforced, but let's verify values)
        assertEq(lockbox.agent(), agentWallet);
        assertEq(lockbox.vault(), vaultAddr);
        assertEq(lockbox.agentId(), agentId);
    }

    // ── Fuzz tests ──────────────────────────────────────────────

    function testFuzz_processRevenue_splitIsCorrect(uint256 amount, uint256 rateBps) public {
        amount = bound(amount, 1, 1_000_000_000e6);
        rateBps = bound(rateBps, 0, 10000);

        RevenueLockbox lb = new RevenueLockbox(
            agentWallet, vaultAddr, agentId, address(usdc), rateBps
        );
        usdc.mint(address(lb), amount);

        lb.processRevenue();

        uint256 expectedRepayment = (amount * rateBps) / 10000;
        uint256 expectedAgent = amount - expectedRepayment;

        assertEq(usdc.balanceOf(vaultAddr), expectedRepayment);
        assertEq(usdc.balanceOf(agentWallet), expectedAgent);
    }
}
