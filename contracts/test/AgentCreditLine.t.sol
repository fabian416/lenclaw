// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ERC20Mock} from "./mocks/ERC20Mock.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {RevenueLockbox} from "../src/RevenueLockbox.sol";
import {AgentCreditLine} from "../src/AgentCreditLine.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract AgentCreditLineTest is Test {
    ERC20Mock public usdt;
    AgentRegistry public registry;
    CreditScorer public scorer;
    AgentVaultFactory public factory;
    AgentCreditLine public creditLine;

    address public owner = address(this);
    address public agentWallet = makeAddr("agent");
    address public depositor = makeAddr("depositor");

    uint256 public agentId;
    address public agentVaultAddr;

    function setUp() public {
        usdt = new ERC20Mock("USD Coin", "USDT", 6);
        registry = new AgentRegistry(owner);
        scorer = new CreditScorer(address(registry), owner);
        factory = new AgentVaultFactory(address(registry), owner);
        factory.setAllowedAsset(address(usdt), true);
        creditLine = new AgentCreditLine(address(registry), address(scorer), address(factory), owner);

        // Link registry to factory for auto vault deployment
        registry.setVaultFactory(address(factory));

        // Register agent (auto-deploys vault via factory)
        bytes32 codeHash = keccak256("agent-code");
        agentId = registry.registerAgent(agentWallet, codeHash, "Test Agent", address(0), 0, bytes32(0), address(usdt));
        agentVaultAddr = factory.getVault(agentId);

        // Set credit line on the vault
        factory.setVaultCreditLine(agentId, address(creditLine));

        // Use the factory-deployed lockbox (auto-created during registerAgent)
        address lockboxAddr = factory.getLockbox(agentId);

        // Give lockbox some revenue (so credit line is not zero)
        usdt.mint(lockboxAddr, 50_000e6);
        vm.prank(agentWallet);
        RevenueLockbox(payable(lockboxAddr)).processRevenue();

        // Seed the agent's vault with additional liquidity from depositor
        // (vault has 25K from lockbox revenue, cap is 500K, so deposit up to 400K)
        usdt.mint(depositor, 400_000e6);
        vm.startPrank(depositor);
        usdt.approve(agentVaultAddr, 400_000e6);
        AgentVault(agentVaultAddr).deposit(400_000e6, depositor);
        vm.stopPrank();

        // Disable SmartWallet enforcement for most tests (agent has no SmartWallet)
        creditLine.setRequireSmartWallet(false);
    }

    // ── Drawdown ────────────────────────────────────────────────

    function test_drawdown_success() public {
        creditLine.refreshCreditLine(agentId);

        uint256 balanceBefore = usdt.balanceOf(agentWallet);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 1000e6);

        assertEq(usdt.balanceOf(agentWallet) - balanceBefore, 1000e6);
    }

    function test_drawdown_revertsForNonAgent() public {
        creditLine.refreshCreditLine(agentId);

        vm.prank(makeAddr("imposter"));
        vm.expectRevert("AgentCreditLine: not agent owner");
        creditLine.drawdown(agentId, 1000e6);
    }

    function test_drawdown_revertsWhenExceedsCreditLimit() public {
        creditLine.refreshCreditLine(agentId);

        vm.prank(agentWallet);
        vm.expectRevert("AgentCreditLine: exceeds credit limit");
        creditLine.drawdown(agentId, 999_999_999e6);
    }

    // ── Repayment ───────────────────────────────────────────────

    function test_repay_reducesPrincipal() public {
        creditLine.refreshCreditLine(agentId);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 5000e6);

        // Agent repays
        usdt.mint(agentWallet, 5000e6);
        vm.startPrank(agentWallet);
        usdt.approve(address(creditLine), 5000e6);
        creditLine.repay(agentId, 5000e6);
        vm.stopPrank();

        uint256 outstanding = creditLine.getOutstanding(agentId);
        assertEq(outstanding, 0, "Should be fully repaid");
    }

    function test_repay_interestPaidFirst() public {
        creditLine.refreshCreditLine(agentId);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 10_000e6);

        // Warp forward to accrue interest
        vm.warp(block.timestamp + 30 days);

        uint256 outstandingBefore = creditLine.getOutstanding(agentId);
        assertGt(outstandingBefore, 10_000e6, "Should have accrued interest");

        // Partial repayment
        usdt.mint(agentWallet, 1000e6);
        vm.startPrank(agentWallet);
        usdt.approve(address(creditLine), 1000e6);
        creditLine.repay(agentId, 1000e6);
        vm.stopPrank();

        uint256 outstandingAfter = creditLine.getOutstanding(agentId);
        assertLt(outstandingAfter, outstandingBefore, "Outstanding should decrease");
    }

    function test_repay_revertsOnZeroAmount() public {
        vm.expectRevert("AgentCreditLine: zero amount");
        creditLine.repay(agentId, 0);
    }

    function test_repay_revertsWhenNothingOwed() public {
        vm.expectRevert("AgentCreditLine: nothing owed");
        creditLine.repay(agentId, 1000e6);
    }

    // ── Status / Delinquency ────────────────────────────────────

    function test_status_startsActive() public view {
        AgentCreditLine.Status status = creditLine.getStatus(agentId);
        assertEq(uint8(status), uint8(AgentCreditLine.Status.ACTIVE));
    }

    function test_status_becomesDelinquentAfterGracePeriod() public {
        creditLine.refreshCreditLine(agentId);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 1000e6);

        vm.warp(block.timestamp + 8 days);

        creditLine.updateStatus(agentId);

        AgentCreditLine.Status status = creditLine.getStatus(agentId);
        assertEq(uint8(status), uint8(AgentCreditLine.Status.DELINQUENT));
    }

    function test_status_becomesDefaultAfterDelinquencyPeriod() public {
        creditLine.refreshCreditLine(agentId);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 1000e6);

        vm.warp(block.timestamp + 38 days);

        creditLine.updateStatus(agentId);

        AgentCreditLine.Status status = creditLine.getStatus(agentId);
        assertEq(uint8(status), uint8(AgentCreditLine.Status.DEFAULT));
    }

    function test_status_repaymentRevertsDelinquency() public {
        creditLine.refreshCreditLine(agentId);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 1000e6);

        // Go delinquent
        vm.warp(block.timestamp + 8 days);
        creditLine.updateStatus(agentId);
        assertEq(uint8(creditLine.getStatus(agentId)), uint8(AgentCreditLine.Status.DELINQUENT));

        // Repay - should revert to active
        usdt.mint(agentWallet, 500e6);
        vm.startPrank(agentWallet);
        usdt.approve(address(creditLine), 500e6);
        creditLine.repay(agentId, 500e6);
        vm.stopPrank();

        assertEq(uint8(creditLine.getStatus(agentId)), uint8(AgentCreditLine.Status.ACTIVE));
    }

    // ── Interest accrual ────────────────────────────────────────

    function test_interestAccruesOverTime() public {
        creditLine.refreshCreditLine(agentId);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 10_000e6);

        uint256 outstandingT0 = creditLine.getOutstanding(agentId);

        vm.warp(block.timestamp + 365 days);

        uint256 outstandingT1 = creditLine.getOutstanding(agentId);
        assertGt(outstandingT1, outstandingT0, "Interest should accrue");
    }

    function test_noInterestWithZeroPrincipal() public view {
        uint256 outstanding = creditLine.getOutstanding(agentId);
        assertEq(outstanding, 0, "No interest with zero principal");
    }

    // ── Refresh credit line ─────────────────────────────────────

    function test_refreshCreditLine_updatesLimitAndRate() public {
        creditLine.refreshCreditLine(agentId);

        (uint256 principal,,, uint256 rate, uint256 limit,) = creditLine.facilities(agentId);

        assertGt(limit, 0, "Credit limit should be set");
        assertGt(rate, 0, "Interest rate should be set");
        assertEq(principal, 0, "No principal yet");
    }

    function test_refreshCreditLine_revertsForUnregistered() public {
        vm.expectRevert("AgentCreditLine: agent not registered");
        creditLine.refreshCreditLine(999);
    }

    // ── Admin functions ─────────────────────────────────────────

    function test_setGracePeriod_onlyOwner() public {
        vm.prank(makeAddr("nonOwner"));
        vm.expectRevert();
        creditLine.setGracePeriod(14 days);
    }

    function test_setDelinquencyPeriod_onlyOwner() public {
        vm.prank(makeAddr("nonOwner"));
        vm.expectRevert();
        creditLine.setDelinquencyPeriod(60 days);
    }

    // ── Period minimum enforcement ──────────────────────────────

    function test_setGracePeriod_revertsIfBelowMinimum() public {
        vm.expectRevert("AgentCreditLine: period too short");
        creditLine.setGracePeriod(0);

        vm.expectRevert("AgentCreditLine: period too short");
        creditLine.setGracePeriod(12 hours);

        // Exactly 1 day should succeed
        creditLine.setGracePeriod(1 days);
        assertEq(creditLine.gracePeriod(), 1 days);
    }

    function test_setDelinquencyPeriod_revertsIfBelowMinimum() public {
        vm.expectRevert("AgentCreditLine: period too short");
        creditLine.setDelinquencyPeriod(0);

        vm.expectRevert("AgentCreditLine: period too short");
        creditLine.setDelinquencyPeriod(2 days);

        // Exactly 3 days should succeed
        creditLine.setDelinquencyPeriod(3 days);
        assertEq(creditLine.delinquencyPeriod(), 3 days);
    }

    function test_setDefaultPeriod_revertsIfBelowMinimum() public {
        vm.expectRevert("AgentCreditLine: period too short");
        creditLine.setDefaultPeriod(0);

        vm.expectRevert("AgentCreditLine: period too short");
        creditLine.setDefaultPeriod(6 days);

        // Exactly 7 days should succeed
        creditLine.setDefaultPeriod(7 days);
        assertEq(creditLine.defaultPeriod(), 7 days);
    }

    // ── SmartWallet enforcement ─────────────────────────────────

    function test_drawdown_succeedsWithSmartWalletEnforcement() public {
        // Agent was registered with asset, so SmartWallet was auto-deployed
        // Re-enable SmartWallet enforcement - should succeed because agent has a SmartWallet
        creditLine.setRequireSmartWallet(true);
        creditLine.refreshCreditLine(agentId);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 1000e6);

        uint256 outstanding = creditLine.getOutstanding(agentId);
        assertGe(outstanding, 1000e6, "Should have outstanding debt");
    }
}
