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
import {AgentSmartWallet} from "../src/AgentSmartWallet.sol";
import {SmartWalletFactory} from "../src/SmartWalletFactory.sol";
import {DutchAuction} from "../src/DutchAuction.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Fuzz Tests — property-based tests for LenClaw protocol
/// @notice Covers: drawdown amounts, interest accrual, auction price decay,
///         credit scoring bounds, SmartWallet revenue routing, vault accounting.
contract FuzzTests is Test {
    ERC20Mock public usdc;
    AgentRegistry public registry;
    CreditScorer public scorer;
    AgentVaultFactory public factory;
    AgentCreditLine public creditLine;
    DutchAuction public dutchAuction;

    address public owner = address(this);
    address public agentWallet = makeAddr("agent");
    address public depositor = makeAddr("depositor");

    uint256 public agentId;
    address public agentVaultAddr;
    address public lockboxAddr;

    function setUp() public {
        usdc = new ERC20Mock("USD Coin", "USDC", 6);
        registry = new AgentRegistry(owner);
        scorer = new CreditScorer(address(registry), owner);
        factory = new AgentVaultFactory(address(registry), owner);
        factory.setAllowedAsset(address(usdc), true);
        creditLine = new AgentCreditLine(
            address(registry), address(scorer), address(factory), owner
        );

        registry.setVaultFactory(address(factory));
        scorer.setCreditLine(address(creditLine));
        creditLine.setRequireSmartWallet(false);

        // Register agent (auto-deploys vault + lockbox)
        agentId = registry.registerAgent(
            agentWallet, keccak256("agent-code"), "FuzzAgent", address(0), 0, bytes32(0), address(usdc)
        );
        agentVaultAddr = factory.getVault(agentId);
        lockboxAddr = factory.getLockbox(agentId);

        // Set credit line on vault
        factory.setVaultCreditLine(agentId, address(creditLine));

        // Seed lockbox with revenue to establish credit
        usdc.mint(lockboxAddr, 50_000e6);
        vm.prank(agentWallet);
        RevenueLockbox(payable(lockboxAddr)).processRevenue();

        // Seed vault with depositor liquidity (cap is 500K, lockbox already added 25K)
        usdc.mint(depositor, 400_000e6);
        vm.startPrank(depositor);
        usdc.approve(agentVaultAddr, 400_000e6);
        AgentVault(agentVaultAddr).deposit(400_000e6, depositor);
        vm.stopPrank();

        // Deploy DutchAuction for auction fuzz tests
        dutchAuction = new DutchAuction(address(usdc), address(this), owner);
    }

    // ═══════════════════════════════════════════════════════════════
    //  1. DRAWDOWN FUZZ — any valid amount between MIN_DRAWDOWN and credit limit
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_drawdown_withinCreditLimit(uint256 amount) public {
        creditLine.refreshCreditLine(agentId);
        (, , , , uint256 creditLimit, ) = creditLine.facilities(agentId);

        // Bound between min drawdown (10 USDC) and credit limit
        amount = bound(amount, 10e6, creditLimit);

        uint256 balanceBefore = usdc.balanceOf(agentWallet);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, amount);

        uint256 balanceAfter = usdc.balanceOf(agentWallet);
        assertEq(balanceAfter - balanceBefore, amount, "Agent should receive exact drawdown amount");

        uint256 outstanding = creditLine.getOutstanding(agentId);
        assertGe(outstanding, amount, "Outstanding should be >= borrowed amount");
        assertLe(outstanding, creditLimit, "Outstanding should not exceed credit limit");
    }

    function testFuzz_drawdown_exceedsCreditLimit_reverts(uint256 amount) public {
        creditLine.refreshCreditLine(agentId);
        (, , , , uint256 creditLimit, ) = creditLine.facilities(agentId);

        // Amount above credit limit
        amount = bound(amount, creditLimit + 1, type(uint128).max);

        vm.prank(agentWallet);
        vm.expectRevert("AgentCreditLine: exceeds credit limit");
        creditLine.drawdown(agentId, amount);
    }

    // ═══════════════════════════════════════════════════════════════
    //  2. INTEREST ACCRUAL FUZZ — no overflow for any principal × time combo
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_interestAccrual_noOverflow(uint256 amount, uint256 timeElapsed) public {
        creditLine.refreshCreditLine(agentId);
        (, , , , uint256 creditLimit, ) = creditLine.facilities(agentId);

        amount = bound(amount, 10e6, creditLimit);
        // Up to 10 years
        timeElapsed = bound(timeElapsed, 1 hours, 3650 days);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, amount);

        vm.warp(block.timestamp + timeElapsed);

        // Should not revert with overflow
        uint256 outstanding = creditLine.getOutstanding(agentId);
        assertGe(outstanding, amount, "Outstanding should be >= principal");

        // Interest formula: principal * rateBps * elapsed / (365 days * 10000)
        // With max principal ~100K USDC (100_000e6), max rate 2500 bps, max time 10yr:
        // 100_000e6 * 2500 * 3650 days / (365 days * 10000) = 250_000e6 — well within uint256
        assertLt(outstanding, type(uint128).max, "Outstanding should be reasonable");
    }

    function testFuzz_interestAccrual_monotonicallyIncreasing(uint256 time1, uint256 time2) public {
        creditLine.refreshCreditLine(agentId);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 10_000e6);

        time1 = bound(time1, 1 hours, 365 days);
        time2 = bound(time2, time1 + 1, 730 days);

        vm.warp(block.timestamp + time1);
        uint256 outstanding1 = creditLine.getOutstanding(agentId);

        vm.warp(block.timestamp + (time2 - time1));
        uint256 outstanding2 = creditLine.getOutstanding(agentId);

        assertGe(outstanding2, outstanding1, "Interest should always increase with time");
    }

    // ═══════════════════════════════════════════════════════════════
    //  3. REPAYMENT FUZZ — partial repayment always reduces outstanding
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_repayment_reducesOutstanding(uint256 borrowAmount, uint256 repayAmount) public {
        creditLine.refreshCreditLine(agentId);
        (, , , , uint256 creditLimit, ) = creditLine.facilities(agentId);

        borrowAmount = bound(borrowAmount, 10e6, creditLimit);
        vm.prank(agentWallet);
        creditLine.drawdown(agentId, borrowAmount);

        // Accrue some interest
        vm.warp(block.timestamp + 30 days);

        uint256 outstandingBefore = creditLine.getOutstanding(agentId);
        repayAmount = bound(repayAmount, 1, outstandingBefore);

        usdc.mint(agentWallet, repayAmount);
        vm.startPrank(agentWallet);
        usdc.approve(address(creditLine), repayAmount);
        creditLine.repay(agentId, repayAmount);
        vm.stopPrank();

        uint256 outstandingAfter = creditLine.getOutstanding(agentId);
        assertLt(outstandingAfter, outstandingBefore, "Outstanding must decrease after repayment");
    }

    // ═══════════════════════════════════════════════════════════════
    //  4. DUTCH AUCTION PRICE DECAY — price always between min and start
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_dutchAuction_priceAlwaysInRange(uint256 debtAmount, uint256 timeElapsed) public {
        debtAmount = bound(debtAmount, 1e6, 10_000_000e6); // 1 USDC to 10M USDC
        timeElapsed = bound(timeElapsed, 0, 6 hours);       // Within auction duration

        uint256 auctionId = dutchAuction.createAuction(agentId, debtAmount);

        vm.warp(block.timestamp + timeElapsed);

        uint256 price = dutchAuction.getCurrentPrice(auctionId);
        uint256 startPrice = (debtAmount * 15000) / 10000; // 150%
        uint256 minPrice = (debtAmount * 3000) / 10000;    // 30%

        assertGe(price, minPrice, "Price should never go below minPrice");
        assertLe(price, startPrice, "Price should never exceed startPrice");
    }

    function testFuzz_dutchAuction_priceDecaysMonotonically(uint256 debtAmount, uint256 t1, uint256 t2) public {
        debtAmount = bound(debtAmount, 1e6, 10_000_000e6);
        t1 = bound(t1, 0, 6 hours - 1);
        t2 = bound(t2, t1 + 1, 6 hours);

        uint256 auctionId = dutchAuction.createAuction(agentId, debtAmount);

        vm.warp(block.timestamp + t1);
        uint256 price1 = dutchAuction.getCurrentPrice(auctionId);

        vm.warp(block.timestamp + (t2 - t1));
        uint256 price2 = dutchAuction.getCurrentPrice(auctionId);

        assertLe(price2, price1, "Price should only decrease over time");
    }

    function testFuzz_dutchAuction_bidPaysExactPrice(uint256 debtAmount, uint256 timeElapsed) public {
        debtAmount = bound(debtAmount, 100e6, 1_000_000e6);
        timeElapsed = bound(timeElapsed, 0, 6 hours);

        uint256 auctionId = dutchAuction.createAuction(agentId, debtAmount);
        vm.warp(block.timestamp + timeElapsed);

        uint256 expectedPrice = dutchAuction.getCurrentPrice(auctionId);

        address bidder = makeAddr("bidder");
        usdc.mint(bidder, expectedPrice);

        uint256 bidderBalBefore = usdc.balanceOf(bidder);

        vm.startPrank(bidder);
        usdc.approve(address(dutchAuction), expectedPrice);
        dutchAuction.bid(auctionId, type(uint256).max);
        vm.stopPrank();

        uint256 bidderBalAfter = usdc.balanceOf(bidder);
        assertEq(bidderBalBefore - bidderBalAfter, expectedPrice, "Bidder should pay exact current price");

        DutchAuction.Auction memory auction = dutchAuction.getAuction(auctionId);
        assertEq(uint8(auction.status), uint8(DutchAuction.AuctionStatus.SETTLED));
        assertEq(auction.buyer, bidder);
    }

    // ═══════════════════════════════════════════════════════════════
    //  5. CREDIT SCORING — composite score always in [0, 100]
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_creditScore_alwaysBounded(uint256 revenue, uint256 timeInProtocol) public {
        revenue = bound(revenue, 0, 1_000_000e6);
        timeInProtocol = bound(timeInProtocol, 0, 365 days);

        address fuzzAgent = makeAddr(string(abi.encodePacked("fuzzAgent", revenue)));
        uint256 fuzzId = registry.registerAgent(
            fuzzAgent, keccak256(abi.encodePacked("code", revenue)), "FuzzScoreAgent", address(0), 0, bytes32(0), address(usdc)
        );

        if (revenue > 0) {
            address fuzzLockbox = factory.getLockbox(fuzzId);
            usdc.mint(fuzzLockbox, revenue);
            vm.prank(fuzzAgent);
            RevenueLockbox(payable(fuzzLockbox)).processRevenue();
        }

        vm.warp(block.timestamp + timeInProtocol);

        uint256 score = scorer.getCompositeScore(fuzzId);
        assertLe(score, 100, "Score must be <= 100");
        // Score is uint256, so >= 0 is always true, but let's verify the formula
        // doesn't produce an absurdly large number
        assertTrue(score <= 100, "Score should be in valid range");
    }

    function testFuzz_creditLine_limitsAlwaysClamped(uint256 revenue) public {
        revenue = bound(revenue, 0, 10_000_000e6);

        address fuzzAgent = makeAddr(string(abi.encodePacked("clampAgent", revenue)));
        uint256 fuzzId = registry.registerAgent(
            fuzzAgent, keccak256(abi.encodePacked("clamp", revenue)), "ClampAgent", address(0), 0, bytes32(0), address(usdc)
        );

        if (revenue > 0) {
            address fuzzLockbox = factory.getLockbox(fuzzId);
            usdc.mint(fuzzLockbox, revenue);
            vm.prank(fuzzAgent);
            RevenueLockbox(payable(fuzzLockbox)).processRevenue();
        }

        (uint256 limit, uint256 rate) = scorer.calculateCreditLine(fuzzId);

        assertGe(limit, scorer.minCreditLine(), "Limit must be >= min");
        assertLe(limit, scorer.maxCreditLine(), "Limit must be <= max");
        assertGe(rate, scorer.minRateBps(), "Rate must be >= min");
        assertLe(rate, scorer.maxRateBps(), "Rate must be <= max");
    }

    // ═══════════════════════════════════════════════════════════════
    //  6. SMART WALLET REVENUE ROUTING — split is always exact
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_smartWallet_revenueRouting(uint256 balance, uint256 rateBps) public {
        balance = bound(balance, 1, 1_000_000_000e6);
        rateBps = bound(rateBps, 0, 10000);

        address fuzzAgent2 = makeAddr("swAgent");
        uint256 fuzzId2 = registry.registerAgent(
            fuzzAgent2, keccak256("swCode"), "SWAgent", address(0), 0, bytes32(0), address(usdc)
        );
        address fuzzLockbox2 = factory.getLockbox(fuzzId2);

        AgentSmartWallet wallet = new AgentSmartWallet(
            fuzzAgent2, address(this), fuzzLockbox2, address(usdc), fuzzId2, rateBps
        );

        usdc.mint(address(wallet), balance);

        uint256 lockboxBalBefore = usdc.balanceOf(fuzzLockbox2);

        wallet.routeRevenue();

        uint256 expectedToLockbox = (balance * rateBps) / 10000;
        uint256 expectedRemaining = balance - expectedToLockbox;

        assertEq(
            usdc.balanceOf(fuzzLockbox2) - lockboxBalBefore,
            expectedToLockbox,
            "Lockbox should receive exact repayment portion"
        );
        assertEq(
            usdc.balanceOf(address(wallet)),
            expectedRemaining,
            "Wallet should retain exact remainder"
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  7. VAULT ERC-4626 ACCOUNTING — deposit then withdraw preserves value
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_vault_depositWithdrawConsistency(uint256 depositAmount) public {
        depositAmount = bound(depositAmount, 100e6, 100_000e6); // MIN_DEPOSIT to 100K

        // Use a fresh vault for isolation
        address freshAgent = makeAddr("freshVaultAgent");
        uint256 freshId = registry.registerAgent(
            freshAgent, keccak256("freshCode"), "FreshAgent", address(0), 0, bytes32(0), address(usdc)
        );
        address freshVaultAddr = factory.getVault(freshId);
        AgentVault freshVault = AgentVault(freshVaultAddr);

        address backer = makeAddr("backer");
        usdc.mint(backer, depositAmount);

        vm.startPrank(backer);
        usdc.approve(freshVaultAddr, depositAmount);
        uint256 shares = freshVault.deposit(depositAmount, backer);
        vm.stopPrank();

        assertGt(shares, 0, "Should receive shares");
        assertEq(freshVault.totalAssets(), depositAmount, "Total assets should equal deposit");

        // Request withdrawal and wait
        vm.startPrank(backer);
        freshVault.approve(freshVaultAddr, shares);
        freshVault.requestWithdrawal();
        vm.warp(block.timestamp + 1 days + 1);

        uint256 redeemed = freshVault.redeem(shares, backer, backer);
        vm.stopPrank();

        // ERC-4626 virtual offset causes ±1 wei rounding
        assertApproxEqAbs(redeemed, depositAmount, 1, "Should get back deposit (within rounding)");
    }

    function testFuzz_vault_multipleBackers_sharesProportional(uint256 amount1, uint256 amount2) public {
        amount1 = bound(amount1, 100e6, 100_000e6);
        amount2 = bound(amount2, 100e6, 100_000e6);

        address freshAgent = makeAddr("multiBackerAgent");
        uint256 freshId = registry.registerAgent(
            freshAgent, keccak256("multiCode"), "MultiAgent", address(0), 0, bytes32(0), address(usdc)
        );
        address freshVaultAddr = factory.getVault(freshId);
        AgentVault freshVault = AgentVault(freshVaultAddr);

        address backer1 = makeAddr("backer1");
        address backer2 = makeAddr("backer2");
        usdc.mint(backer1, amount1);
        usdc.mint(backer2, amount2);

        vm.startPrank(backer1);
        usdc.approve(freshVaultAddr, amount1);
        uint256 shares1 = freshVault.deposit(amount1, backer1);
        vm.stopPrank();

        vm.startPrank(backer2);
        usdc.approve(freshVaultAddr, amount2);
        uint256 shares2 = freshVault.deposit(amount2, backer2);
        vm.stopPrank();

        // Shares should be proportional to deposits (within ERC-4626 virtual offset rounding)
        // shares1/shares2 ≈ amount1/amount2
        // Cross-multiply to avoid division: shares1 * amount2 ≈ shares2 * amount1
        uint256 lhs = shares1 * amount2;
        uint256 rhs = shares2 * amount1;

        // Allow small rounding delta (proportional to total supply, +/- a few shares)
        uint256 tolerance = (shares1 + shares2) * 2; // generous tolerance for virtual offset
        assertApproxEqAbs(lhs, rhs, tolerance, "Shares should be proportional to deposits");
    }

    // ═══════════════════════════════════════════════════════════════
    //  8. REVENUE LOCKBOX — revenue cap enforcement
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_lockbox_revenueCap(uint256 revenue, uint256 cap) public {
        cap = bound(cap, 1e6, 10_000_000e6);
        revenue = bound(revenue, cap + 1, cap * 3); // Always above cap

        address capAgent = makeAddr("capAgent");

        // Deploy a standalone vault (this test contract is the factory)
        AgentVault capVault = new AgentVault(
            IERC20(address(usdc)), 99, "Cap Vault", "lcCAP", 0, type(uint256).max
        );

        // Create lockbox with cap — uses standalone vault so we can setLockbox
        RevenueLockbox capLockbox = new RevenueLockbox(
            capAgent, address(capVault), 99, address(usdc), 5000, address(0), cap
        );
        capVault.setLockbox(address(capLockbox));

        usdc.mint(address(capLockbox), revenue);

        vm.prank(capAgent);
        capLockbox.processRevenue();

        // Only 'cap' amount should have been processed
        assertEq(capLockbox.totalRevenueCapture(), cap, "Should only process up to cap");

        // Remaining should stay in lockbox
        assertEq(
            usdc.balanceOf(address(capLockbox)),
            revenue - cap,
            "Excess should remain in lockbox"
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  9. WRITE-DOWN FUZZ — debt reduction always correct
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_writeDown_reducesDebt(uint256 borrowAmount, uint256 writeDownAmount) public {
        creditLine.refreshCreditLine(agentId);
        (, , , , uint256 creditLimit, ) = creditLine.facilities(agentId);

        borrowAmount = bound(borrowAmount, 10e6, creditLimit);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, borrowAmount);

        // Accrue some interest
        vm.warp(block.timestamp + 30 days);

        uint256 outstandingBefore = creditLine.getOutstanding(agentId);
        writeDownAmount = bound(writeDownAmount, 1, outstandingBefore * 2); // Can exceed outstanding

        // Set recovery manager to this contract for authorization
        creditLine.setRecoveryManager(address(this));
        creditLine.writeDown(agentId, writeDownAmount);

        uint256 outstandingAfter = creditLine.getOutstanding(agentId);

        if (writeDownAmount >= outstandingBefore) {
            assertEq(outstandingAfter, 0, "Should be fully written down");
        } else {
            assertLt(outstandingAfter, outstandingBefore, "Outstanding should decrease");
            // Allow small delta from interest accrual between getOutstanding calls
            assertApproxEqAbs(
                outstandingBefore - outstandingAfter,
                writeDownAmount,
                1, // rounding
                "Write-down should reduce debt by exact amount"
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  10. VAULT PROTOCOL FEES — fee always <= interest portion
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_vault_protocolFees_correctCalculation(uint256 repayAmount, uint256 interestPortion) public {
        // Use the existing vault with credit line set
        address cl = address(creditLine);

        repayAmount = bound(repayAmount, 1e6, 100_000e6);
        interestPortion = bound(interestPortion, 0, repayAmount);

        // Need to deposit first so vault has assets
        address feeBacker = makeAddr("feeBacker");
        usdc.mint(feeBacker, 200_000e6);
        vm.startPrank(feeBacker);
        usdc.approve(agentVaultAddr, 200_000e6);
        vm.stopPrank();

        // Mint USDC to credit line and have it call receiveRepayment
        usdc.mint(cl, repayAmount);
        vm.startPrank(cl);
        usdc.approve(agentVaultAddr, repayAmount);
        AgentVault(agentVaultAddr).receiveRepayment(repayAmount, interestPortion);
        vm.stopPrank();

        // Fee should be exactly protocolFeeBps% of interestPortion
        uint256 expectedFee = (interestPortion * AgentVault(agentVaultAddr).protocolFeeBps()) / 10000;
        assertEq(
            AgentVault(agentVaultAddr).accumulatedFees(),
            expectedFee,
            "Fee should be exact percentage of interest"
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  11. STATUS TRANSITIONS — delinquency timing boundaries
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_status_transitionsAtCorrectTime(uint256 timeElapsed) public {
        creditLine.refreshCreditLine(agentId);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 1_000e6);

        // Allow the default period to be met
        timeElapsed = bound(timeElapsed, 0, 60 days);
        vm.warp(block.timestamp + timeElapsed);
        creditLine.updateStatus(agentId);

        AgentCreditLine.Status status = creditLine.getStatus(agentId);

        if (timeElapsed > creditLine.defaultPeriod()) {
            assertEq(uint8(status), uint8(AgentCreditLine.Status.DEFAULT), "Should be DEFAULT past default period");
        } else if (timeElapsed > creditLine.gracePeriod()) {
            assertEq(uint8(status), uint8(AgentCreditLine.Status.DELINQUENT), "Should be DELINQUENT past grace period");
        } else {
            assertEq(uint8(status), uint8(AgentCreditLine.Status.ACTIVE), "Should be ACTIVE within grace period");
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  12. LOCKBOX EPOCH TRACKING — epoch calculation always correct
    // ═══════════════════════════════════════════════════════════════

    function testFuzz_lockbox_epochCalculation(uint256 timeElapsed) public {
        timeElapsed = bound(timeElapsed, 0, 365 days * 5); // Up to 5 years

        RevenueLockbox lockbox = RevenueLockbox(payable(lockboxAddr));
        uint256 deployedAt = lockbox.deployedAt();

        vm.warp(deployedAt + timeElapsed);

        uint256 epoch = lockbox.currentEpoch();
        uint256 expectedEpoch = timeElapsed / 30 days;

        assertEq(epoch, expectedEpoch, "Epoch should be timeElapsed / EPOCH_LENGTH");
    }
}
