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
import {DutchAuction} from "../src/DutchAuction.sol";
import {LiquidationKeeper} from "../src/LiquidationKeeper.sol";
import {RecoveryManager} from "../src/RecoveryManager.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";

contract LiquidationTest is Test {
    ERC20Mock public usdt;
    AgentRegistry public registry;
    CreditScorer public scorer;
    AgentVaultFactory public factory;
    AgentCreditLine public creditLine;
    DutchAuction public dutchAuction;
    LiquidationKeeper public keeper;
    RecoveryManager public recoveryManager;

    address public owner = address(this);
    address public agentWallet = makeAddr("agent");
    address public depositor = makeAddr("depositor");
    address public keeperBot = makeAddr("keeperBot");
    address public bidder = makeAddr("bidder");

    uint256 public agentId;
    address public agentVaultAddr;

    function setUp() public {
        // Deploy core contracts
        usdt = new ERC20Mock("USD Coin", "USDT", 6);
        registry = new AgentRegistry(owner);
        scorer = new CreditScorer(address(registry), owner);
        factory = new AgentVaultFactory(address(registry), owner);
        factory.setAllowedAsset(address(usdt), true);
        creditLine = new AgentCreditLine(address(registry), address(scorer), address(factory), owner);

        // Link registry to factory
        registry.setVaultFactory(address(factory));

        // Disable SmartWallet enforcement for tests
        creditLine.setRequireSmartWallet(false);

        // Deploy liquidation system
        // RecoveryManager still forwards proceeds to the agent's vault.
        // For these tests we pass address(0) as the vault param since RecoveryManager
        // sends funds to a configured address. We'll use the agent's vault address.
        dutchAuction = new DutchAuction(address(usdt), address(this), owner);

        // Register agent (auto-deploys vault)
        bytes32 codeHash = keccak256("agent-code");
        agentId = registry.registerAgent(agentWallet, codeHash, "Test Agent", address(0), 0, bytes32(0), address(usdt));
        agentVaultAddr = factory.getVault(agentId);

        // Set credit line on vault
        factory.setVaultCreditLine(agentId, address(creditLine));

        // RecoveryManager uses vaultFactory to look up per-agent vaults
        recoveryManager =
            new RecoveryManager(address(usdt), address(dutchAuction), address(registry), address(factory), owner);

        // Update the DutchAuction to point at the real RecoveryManager
        dutchAuction.setRecoveryManager(address(recoveryManager));

        // Register RecoveryManager on factory so it can freeze/unfreeze vaults and write down losses
        factory.setRecoveryManager(address(recoveryManager));

        keeper = new LiquidationKeeper(
            address(creditLine), address(registry), address(usdt), address(recoveryManager), owner
        );

        // Wire up permissions
        recoveryManager.setKeeper(address(keeper));

        // Allow RecoveryManager to call registry.updateReputation()
        registry.setProtocol(address(recoveryManager));

        // Seed agent vault with depositor liquidity FIRST (before lockbox revenue)
        // so the ERC-4626 vault mints shares at 1:1 ratio on the initial deposit.
        usdt.mint(depositor, 400_000e6);
        vm.startPrank(depositor);
        usdt.approve(agentVaultAddr, 400_000e6);
        AgentVault(agentVaultAddr).deposit(400_000e6, depositor);
        vm.stopPrank();

        // Use the factory-deployed lockbox (auto-created during registerAgent)
        address lockboxAddr = factory.getLockbox(agentId);

        // Give lockbox revenue so credit line is non-zero
        usdt.mint(lockboxAddr, 50_000e6);
        vm.prank(agentWallet);
        RevenueLockbox(payable(lockboxAddr)).processRevenue();

        // Fund keeper bounty pool
        usdt.mint(address(keeper), 10_000e6);

        // Fund bidder
        usdt.mint(bidder, 500_000e6);
    }

    // Helper: put agent into DEFAULT status
    function _defaultAgent(uint256 borrowAmount) internal {
        creditLine.refreshCreditLine(agentId);

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, borrowAmount);

        // Warp past default period (30 days)
        vm.warp(block.timestamp + 31 days);
        creditLine.updateStatus(agentId);
    }

    // DutchAuction Tests

    function test_dutchAuction_createAuction() public {
        uint256 auctionId = dutchAuction.createAuction(agentId, 10_000e6);

        DutchAuction.Auction memory auction = dutchAuction.getAuction(auctionId);
        assertEq(auction.agentId, agentId);
        assertEq(auction.debtAmount, 10_000e6);
        assertEq(uint8(auction.status), uint8(DutchAuction.AuctionStatus.ACTIVE));

        // Start price = 150% of debt
        assertEq(auction.startPrice, 15_000e6);
        // Min price = 30% of debt
        assertEq(auction.minPrice, 3_000e6);
    }

    function test_dutchAuction_priceDecaysLinearly() public {
        uint256 auctionId = dutchAuction.createAuction(agentId, 10_000e6);

        // At t=0, price should be startPrice
        uint256 priceAtStart = dutchAuction.getCurrentPrice(auctionId);
        assertEq(priceAtStart, 15_000e6);

        // At t=duration/2, price should be midpoint
        vm.warp(block.timestamp + 3 hours); // half of 6 hours
        uint256 priceMid = dutchAuction.getCurrentPrice(auctionId);
        assertEq(priceMid, 9_000e6);

        // At t=duration, price should be minPrice
        vm.warp(block.timestamp + 3 hours);
        uint256 priceEnd = dutchAuction.getCurrentPrice(auctionId);
        assertEq(priceEnd, 3_000e6);
    }

    function test_dutchAuction_bidSettlesAuction() public {
        uint256 auctionId = dutchAuction.createAuction(agentId, 10_000e6);

        // Warp 2 hours into auction
        vm.warp(block.timestamp + 2 hours);
        uint256 currentPrice = dutchAuction.getCurrentPrice(auctionId);
        assertGt(currentPrice, 0);

        // Bidder bids
        vm.startPrank(bidder);
        usdt.approve(address(dutchAuction), currentPrice);
        dutchAuction.bid(auctionId, type(uint256).max);
        vm.stopPrank();

        DutchAuction.Auction memory auction = dutchAuction.getAuction(auctionId);
        assertEq(uint8(auction.status), uint8(DutchAuction.AuctionStatus.SETTLED));
        assertEq(auction.buyer, bidder);
        assertEq(auction.settledPrice, currentPrice);
    }

    function test_dutchAuction_cannotBidAfterExpiry() public {
        uint256 auctionId = dutchAuction.createAuction(agentId, 10_000e6);

        // Warp past auction duration
        vm.warp(block.timestamp + 7 hours);

        vm.startPrank(bidder);
        usdt.approve(address(dutchAuction), 15_000e6);
        vm.expectRevert("DutchAuction: expired");
        dutchAuction.bid(auctionId, type(uint256).max);
        vm.stopPrank();
    }

    function test_dutchAuction_markExpired() public {
        uint256 auctionId = dutchAuction.createAuction(agentId, 10_000e6);

        // Cannot expire before duration
        vm.expectRevert("DutchAuction: not yet expired");
        dutchAuction.markExpired(auctionId);

        // Warp past duration
        vm.warp(block.timestamp + 7 hours);
        dutchAuction.markExpired(auctionId);

        DutchAuction.Auction memory auction = dutchAuction.getAuction(auctionId);
        assertEq(uint8(auction.status), uint8(DutchAuction.AuctionStatus.EXPIRED));
        assertFalse(dutchAuction.hasActiveAuction(agentId));
    }

    function test_dutchAuction_noDuplicateAuctions() public {
        dutchAuction.createAuction(agentId, 10_000e6);

        vm.expectRevert("DutchAuction: auction already active for agent");
        dutchAuction.createAuction(agentId, 5_000e6);
    }

    function test_dutchAuction_onlyAuthorizedCanCreate() public {
        vm.prank(makeAddr("random"));
        vm.expectRevert("DutchAuction: not authorized");
        dutchAuction.createAuction(agentId, 10_000e6);
    }

    function test_dutchAuction_setParameters() public {
        dutchAuction.setParameters(20000, 12 hours, 5000);

        // Create auction with new params
        uint256 auctionId = dutchAuction.createAuction(agentId, 10_000e6);
        DutchAuction.Auction memory auction = dutchAuction.getAuction(auctionId);

        assertEq(auction.startPrice, 20_000e6); // 200%
        assertEq(auction.minPrice, 5_000e6); // 50%
        assertEq(auction.duration, 12 hours);
    }

    function test_dutchAuction_setParameters_onlyOwner() public {
        vm.prank(makeAddr("nonOwner"));
        vm.expectRevert();
        dutchAuction.setParameters(20000, 12 hours, 5000);
    }

    function test_dutchAuction_getRemainingTime() public {
        uint256 auctionId = dutchAuction.createAuction(agentId, 10_000e6);

        uint256 remaining = dutchAuction.getRemainingTime(auctionId);
        assertEq(remaining, 6 hours);

        vm.warp(block.timestamp + 2 hours);
        remaining = dutchAuction.getRemainingTime(auctionId);
        assertEq(remaining, 4 hours);

        vm.warp(block.timestamp + 5 hours);
        remaining = dutchAuction.getRemainingTime(auctionId);
        assertEq(remaining, 0);
    }

    // LiquidationKeeper Tests

    function test_keeper_checkLiquidation_eligible() public {
        _defaultAgent(5_000e6);

        (bool eligible, uint256 debt) = keeper.checkLiquidation(agentId);
        assertTrue(eligible);
        assertGt(debt, 0);
    }

    function test_keeper_checkLiquidation_notDefaulted() public {
        // Agent is ACTIVE, not defaulted
        creditLine.refreshCreditLine(agentId);
        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 1_000e6);

        (bool eligible,) = keeper.checkLiquidation(agentId);
        assertFalse(eligible);
    }

    function test_keeper_checkLiquidation_alreadyLiquidated() public {
        _defaultAgent(5_000e6);

        // Trigger first liquidation
        vm.prank(keeperBot);
        keeper.triggerLiquidation(agentId);

        // Should not be eligible again
        (bool eligible,) = keeper.checkLiquidation(agentId);
        assertFalse(eligible);
    }

    function test_keeper_triggerLiquidation_paysBounty() public {
        _defaultAgent(5_000e6);

        uint256 keeperBalanceBefore = usdt.balanceOf(keeperBot);

        vm.prank(keeperBot);
        keeper.triggerLiquidation(agentId);

        uint256 keeperBalanceAfter = usdt.balanceOf(keeperBot);
        assertGt(keeperBalanceAfter, keeperBalanceBefore, "Keeper should receive bounty");

        // Bounty should be 1% of debt, capped at 1000e6
        uint256 bountyPaid = keeperBalanceAfter - keeperBalanceBefore;
        assertLe(bountyPaid, 1_000e6, "Bounty should be capped");
    }

    function test_keeper_triggerLiquidation_revertsIfNotEligible() public {
        // Agent not defaulted yet
        creditLine.refreshCreditLine(agentId);
        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 1_000e6);

        vm.prank(keeperBot);
        vm.expectRevert("LiquidationKeeper: not eligible for liquidation");
        keeper.triggerLiquidation(agentId);
    }

    function test_keeper_fundAndWithdrawBountyPool() public {
        uint256 initialBalance = usdt.balanceOf(address(keeper));

        // Fund more
        usdt.mint(owner, 5_000e6);
        usdt.approve(address(keeper), 5_000e6);
        keeper.fundBountyPool(5_000e6);

        assertEq(usdt.balanceOf(address(keeper)), initialBalance + 5_000e6);

        // Withdraw
        keeper.withdrawBountyPool(owner, 1_000e6);
        assertEq(usdt.balanceOf(address(keeper)), initialBalance + 4_000e6);
    }

    function test_keeper_setKeeperBounty() public {
        keeper.setKeeperBounty(200, 2_000e6);
        assertEq(keeper.keeperBountyBps(), 200);
        assertEq(keeper.maxBountyAmount(), 2_000e6);
    }

    function test_keeper_setKeeperBounty_tooHigh() public {
        vm.expectRevert("LiquidationKeeper: bounty too high");
        keeper.setKeeperBounty(600, 1_000e6); // > 5%
    }

    function test_keeper_setKeeperBounty_onlyOwner() public {
        vm.prank(makeAddr("nonOwner"));
        vm.expectRevert();
        keeper.setKeeperBounty(200, 2_000e6);
    }

    // RecoveryManager Tests

    function test_recovery_startRecovery() public {
        _defaultAgent(5_000e6);

        uint256 debt = creditLine.getOutstanding(agentId);

        vm.prank(keeperBot);
        keeper.triggerLiquidation(agentId);

        // Verify recovery was created
        uint256 recoveryId = recoveryManager.getActiveRecovery(agentId);
        assertGt(recoveryId, 0, "Recovery should be active");

        RecoveryManager.RecoveryRecord memory record = recoveryManager.getRecovery(recoveryId);
        assertEq(record.agentId, agentId);
        assertEq(record.debtAmount, debt);
        assertEq(uint8(record.status), uint8(RecoveryManager.RecoveryStatus.AUCTION_ACTIVE));
    }

    function test_recovery_finalizeAfterAuctionSettled() public {
        _defaultAgent(5_000e6);

        vm.prank(keeperBot);
        keeper.triggerLiquidation(agentId);

        uint256 recoveryId = recoveryManager.getActiveRecovery(agentId);
        RecoveryManager.RecoveryRecord memory record = recoveryManager.getRecovery(recoveryId);
        uint256 auctionId = record.auctionId;

        // Bidder settles auction at current price
        vm.warp(block.timestamp + 1 hours);
        uint256 currentPrice = dutchAuction.getCurrentPrice(auctionId);

        vm.startPrank(bidder);
        usdt.approve(address(dutchAuction), currentPrice);
        dutchAuction.bid(auctionId, type(uint256).max);
        vm.stopPrank();

        // Finalize recovery
        uint256 vaultBalBefore = usdt.balanceOf(agentVaultAddr);
        uint256 bidderSharesBefore = AgentVault(agentVaultAddr).balanceOf(bidder);
        recoveryManager.finalizeRecovery(recoveryId);
        uint256 vaultBalAfter = usdt.balanceOf(agentVaultAddr);
        uint256 bidderSharesAfter = AgentVault(agentVaultAddr).balanceOf(bidder);

        // Proceeds should be forwarded to vault (via deposit)
        assertEq(vaultBalAfter - vaultBalBefore, currentPrice);

        // Buyer should have received vault shares
        assertGt(bidderSharesAfter - bidderSharesBefore, 0, "Buyer should receive vault shares");

        record = recoveryManager.getRecovery(recoveryId);
        assertEq(record.recoveredAmount, currentPrice);
        assertGt(record.completedAt, 0);
    }

    function test_recovery_finalizeAfterAuctionExpired() public {
        _defaultAgent(5_000e6);

        vm.prank(keeperBot);
        keeper.triggerLiquidation(agentId);

        uint256 recoveryId = recoveryManager.getActiveRecovery(agentId);
        RecoveryManager.RecoveryRecord memory record = recoveryManager.getRecovery(recoveryId);
        uint256 auctionId = record.auctionId;

        // Let auction expire
        vm.warp(block.timestamp + 7 hours);
        dutchAuction.markExpired(auctionId);

        // Finalize recovery (write-off)
        recoveryManager.finalizeRecovery(recoveryId);

        record = recoveryManager.getRecovery(recoveryId);
        assertEq(record.recoveredAmount, 0);
        assertEq(uint8(record.status), uint8(RecoveryManager.RecoveryStatus.WRITE_OFF));
        assertEq(record.lossAmount, record.debtAmount);
    }

    function test_recovery_lossDistributedProportionally() public {
        _defaultAgent(5_000e6);

        vm.prank(keeperBot);
        keeper.triggerLiquidation(agentId);

        uint256 recoveryId = recoveryManager.getActiveRecovery(agentId);
        RecoveryManager.RecoveryRecord memory record = recoveryManager.getRecovery(recoveryId);
        uint256 auctionId = record.auctionId;

        // Bidder buys at min price (partial recovery)
        vm.warp(block.timestamp + 6 hours);
        uint256 currentPrice = dutchAuction.getCurrentPrice(auctionId);

        vm.startPrank(bidder);
        usdt.approve(address(dutchAuction), currentPrice);
        dutchAuction.bid(auctionId, type(uint256).max);
        vm.stopPrank();

        // Finalize
        recoveryManager.finalizeRecovery(recoveryId);

        record = recoveryManager.getRecovery(recoveryId);

        // Should be partial recovery with proportional loss
        assertEq(uint8(record.status), uint8(RecoveryManager.RecoveryStatus.PARTIAL_RECOVERY));
        assertGt(record.lossAmount, 0);
        assertEq(recoveryManager.totalLosses(), record.lossAmount);

        // Buyer should still receive vault shares even in partial recovery
        uint256 bidderShares = AgentVault(agentVaultAddr).balanceOf(bidder);
        assertGt(bidderShares, 0, "Buyer should receive shares in partial recovery");
    }

    function test_recovery_reputationSlashedOnDefault() public {
        IAgentRegistry.AgentProfile memory profileBefore = registry.getAgent(agentId);
        uint256 repBefore = profileBefore.reputationScore;

        _defaultAgent(5_000e6);

        vm.prank(keeperBot);
        keeper.triggerLiquidation(agentId);

        // Reputation should be slashed
        IAgentRegistry.AgentProfile memory profileAfter = registry.getAgent(agentId);
        assertLt(profileAfter.reputationScore, repBefore, "Reputation should decrease");
    }

    function test_recovery_aggregateStats() public {
        _defaultAgent(5_000e6);

        vm.prank(keeperBot);
        keeper.triggerLiquidation(agentId);

        uint256 totalDebt = recoveryManager.totalDebtProcessed();
        assertGt(totalDebt, 0, "Should track total debt");
    }

    function test_recovery_onlyKeeperOrOwnerCanStart() public {
        vm.prank(makeAddr("random"));
        vm.expectRevert("RecoveryManager: not authorized");
        recoveryManager.startRecovery(agentId, 10_000e6);
    }

    function test_recovery_overallRecoveryRate() public {
        // Initially zero
        uint256 rate = recoveryManager.overallRecoveryRate();
        assertEq(rate, 0);
    }

    function test_recovery_noDuplicateRecovery() public {
        _defaultAgent(5_000e6);

        vm.prank(keeperBot);
        keeper.triggerLiquidation(agentId);

        // Try to start another recovery for same agent
        vm.expectRevert("RecoveryManager: recovery already active");
        recoveryManager.startRecovery(agentId, 5_000e6);
    }

    // Integration: Full Liquidation Flow

    function test_fullLiquidationFlow() public {
        // 1. Agent borrows
        creditLine.refreshCreditLine(agentId);
        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 10_000e6);

        // 2. Agent defaults (no repayment for 31+ days)
        vm.warp(block.timestamp + 31 days);
        creditLine.updateStatus(agentId);
        assertEq(uint8(creditLine.getStatus(agentId)), uint8(AgentCreditLine.Status.DEFAULT));

        // 3. Keeper detects default and triggers liquidation
        (bool eligible,) = keeper.checkLiquidation(agentId);
        assertTrue(eligible, "Agent should be eligible for liquidation");

        uint256 keeperBalBefore = usdt.balanceOf(keeperBot);
        vm.prank(keeperBot);
        keeper.triggerLiquidation(agentId);
        uint256 keeperBounty = usdt.balanceOf(keeperBot) - keeperBalBefore;
        assertGt(keeperBounty, 0, "Keeper should receive bounty");

        // 4. Dutch auction is running
        uint256 recoveryId = recoveryManager.getActiveRecovery(agentId);
        RecoveryManager.RecoveryRecord memory record = recoveryManager.getRecovery(recoveryId);
        uint256 auctionId = record.auctionId;
        assertTrue(dutchAuction.hasActiveAuction(agentId));

        // 5. Bidder purchases the position at current price (after 2 hours)
        vm.warp(block.timestamp + 2 hours);
        uint256 bidPrice = dutchAuction.getCurrentPrice(auctionId);
        assertGt(bidPrice, 0);

        vm.startPrank(bidder);
        usdt.approve(address(dutchAuction), bidPrice);
        dutchAuction.bid(auctionId, type(uint256).max);
        vm.stopPrank();

        assertFalse(dutchAuction.hasActiveAuction(agentId));

        // 6. Recovery manager finalizes and distributes proceeds
        uint256 vaultBalBefore = usdt.balanceOf(agentVaultAddr);
        uint256 bidderSharesBefore = AgentVault(agentVaultAddr).balanceOf(bidder);
        recoveryManager.finalizeRecovery(recoveryId);
        uint256 vaultBalAfter = usdt.balanceOf(agentVaultAddr);
        uint256 bidderSharesAfter = AgentVault(agentVaultAddr).balanceOf(bidder);

        assertEq(vaultBalAfter - vaultBalBefore, bidPrice, "Vault should receive proceeds");
        assertGt(bidderSharesAfter - bidderSharesBefore, 0, "Buyer should receive vault shares");

        record = recoveryManager.getRecovery(recoveryId);
        assertGt(record.completedAt, 0, "Recovery should be completed");
        assertGt(recoveryManager.totalAmountRecovered(), 0);

        // 7. Verify reputation was slashed
        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        assertLt(profile.reputationScore, 500, "Reputation should be slashed from 500");
    }

    // Edge Cases

    function test_auctionBidAtExactEndTime() public {
        uint256 auctionId = dutchAuction.createAuction(agentId, 10_000e6);

        // Warp to exactly the end time
        vm.warp(block.timestamp + 6 hours);

        uint256 price = dutchAuction.getCurrentPrice(auctionId);
        assertEq(price, 3_000e6, "Should be at min price at exact end");

        // Bid should still work at exact end time
        vm.startPrank(bidder);
        usdt.approve(address(dutchAuction), price);
        dutchAuction.bid(auctionId, type(uint256).max);
        vm.stopPrank();

        DutchAuction.Auction memory auction = dutchAuction.getAuction(auctionId);
        assertEq(uint8(auction.status), uint8(DutchAuction.AuctionStatus.SETTLED));
    }

    function test_cannotFinalizeWhileAuctionActive() public {
        _defaultAgent(5_000e6);

        vm.prank(keeperBot);
        keeper.triggerLiquidation(agentId);

        uint256 recoveryId = recoveryManager.getActiveRecovery(agentId);

        // Auction is still active, cannot finalize
        vm.expectRevert("RecoveryManager: auction still active");
        recoveryManager.finalizeRecovery(recoveryId);
    }

    function test_zeroDebtCannotCreateAuction() public {
        vm.expectRevert("DutchAuction: zero debt");
        dutchAuction.createAuction(agentId, 0);
    }

    function test_auctionBuyer_receivesVaultShares() public {
        // Setup: agent borrows and defaults
        _defaultAgent(5_000e6);

        // Trigger liquidation
        vm.prank(keeperBot);
        keeper.triggerLiquidation(agentId);

        uint256 recoveryId = recoveryManager.getActiveRecovery(agentId);
        RecoveryManager.RecoveryRecord memory record = recoveryManager.getRecovery(recoveryId);
        uint256 auctionId = record.auctionId;

        // Bidder buys at current auction price (after 2 hours)
        vm.warp(block.timestamp + 2 hours);
        uint256 currentPrice = dutchAuction.getCurrentPrice(auctionId);
        assertGt(currentPrice, 0, "Price should be positive");

        // Verify bidder has no vault shares before
        uint256 bidderSharesBefore = AgentVault(agentVaultAddr).balanceOf(bidder);
        assertEq(bidderSharesBefore, 0, "Bidder should have no shares before");

        // Bidder bids on the auction
        vm.startPrank(bidder);
        usdt.approve(address(dutchAuction), currentPrice);
        dutchAuction.bid(auctionId, type(uint256).max);
        vm.stopPrank();

        // Still no shares — shares are minted on finalization, not on bid
        assertEq(AgentVault(agentVaultAddr).balanceOf(bidder), 0, "No shares yet before finalization");

        // Finalize recovery — this should deposit USDT into vault on behalf of buyer
        recoveryManager.finalizeRecovery(recoveryId);

        // Buyer should now have vault shares
        uint256 bidderSharesAfter = AgentVault(agentVaultAddr).balanceOf(bidder);
        assertGt(bidderSharesAfter, 0, "Buyer should receive vault shares after finalization");

        // Vault should have received the USDT
        // The buyer's shares represent their claim on vault assets
        uint256 buyerAssets = AgentVault(agentVaultAddr).convertToAssets(bidderSharesAfter);
        assertGt(buyerAssets, 0, "Buyer shares should be redeemable for assets");

        // Verify the vault is unfrozen after finalization
        assertFalse(AgentVault(agentVaultAddr).frozen(), "Vault should be unfrozen after recovery");

        // Verify recovery record is correct
        record = recoveryManager.getRecovery(recoveryId);
        assertEq(record.recoveredAmount, currentPrice, "Recovered amount should match bid price");
        assertGt(record.completedAt, 0, "Recovery should be completed");
    }

    function test_auctionProceedsGoToRecoveryManager() public {
        uint256 auctionId = dutchAuction.createAuction(agentId, 10_000e6);

        uint256 rmBalBefore = usdt.balanceOf(address(recoveryManager));

        vm.startPrank(bidder);
        uint256 price = dutchAuction.getCurrentPrice(auctionId);
        usdt.approve(address(dutchAuction), price);
        dutchAuction.bid(auctionId, type(uint256).max);
        vm.stopPrank();

        uint256 rmBalAfter = usdt.balanceOf(address(recoveryManager));
        assertEq(rmBalAfter - rmBalBefore, price, "Proceeds go to RecoveryManager");
    }
}
