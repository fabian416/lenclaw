// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20Mock} from "./mocks/ERC20Mock.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {AgentCreditLine} from "../src/AgentCreditLine.sol";
import {RevenueLockbox} from "../src/RevenueLockbox.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CreditScorerTest is Test {
    ERC20Mock public usdt;
    AgentRegistry public registry;
    CreditScorer public scorer;
    AgentVaultFactory public factory;
    AgentCreditLine public creditLine;

    address public owner = address(this);
    address public agentWallet = makeAddr("agent");

    function setUp() public {
        usdt = new ERC20Mock("USD Coin", "USDT", 6);
        registry = new AgentRegistry(owner);
        scorer = new CreditScorer(address(registry), owner);
        factory = new AgentVaultFactory(address(registry), owner);
        factory.setAllowedAsset(address(usdt), true);
        creditLine = new AgentCreditLine(address(registry), address(scorer), address(factory), owner);
        registry.setVaultFactory(address(factory));
        scorer.setCreditLine(address(creditLine));

        // Disable SmartWallet enforcement for tests
        creditLine.setRequireSmartWallet(false);
    }

    function _registerAgent(address wallet, uint256 revenue) internal returns (uint256 agentId) {
        bytes32 codeHash = keccak256(abi.encodePacked("code", wallet));
        agentId = registry.registerAgent(wallet, codeHash, "Test Agent", address(0), 0, bytes32(0), address(usdt));

        // Use the factory-deployed lockbox
        address lockboxAddr = factory.getLockbox(agentId);

        // Simulate revenue
        if (revenue > 0) {
            usdt.mint(lockboxAddr, revenue);
            vm.prank(wallet);
            RevenueLockbox(payable(lockboxAddr)).processRevenue();
        }
    }

    // ── Credit line calculation ──────────────────────────────────

    function test_calculateCreditLine_withRevenue() public {
        uint256 agentId = _registerAgent(agentWallet, 10_000e6);

        (uint256 creditLimit, uint256 rateBps) = scorer.calculateCreditLine(agentId);

        assertGt(creditLimit, 0, "Credit limit should be positive");
        assertGt(rateBps, 0, "Rate should be positive");
        assertGe(creditLimit, scorer.minCreditLine(), "Should be at least min credit line");
        assertLe(creditLimit, scorer.maxCreditLine(), "Should not exceed max credit line");
    }

    function test_calculateCreditLine_revertsWithoutLockbox() public {
        // Register agent on a fresh registry WITHOUT factory linked, so no auto-deploy
        AgentRegistry reg2 = new AgentRegistry(owner);
        CreditScorer scorer2 = new CreditScorer(address(reg2), owner);
        uint256 agentId =
            reg2.registerAgent(agentWallet, keccak256("code"), "Test Agent", address(0), 0, bytes32(0), address(0));

        vm.expectRevert("CreditScorer: no lockbox");
        scorer2.calculateCreditLine(agentId);
    }

    function test_calculateCreditLine_zeroRevenue_getsMinCreditLine() public {
        uint256 agentId = _registerAgent(agentWallet, 0);

        (uint256 creditLimit,) = scorer.calculateCreditLine(agentId);

        assertGe(creditLimit, scorer.minCreditLine(), "Should be at least min credit line");
        assertLe(creditLimit, scorer.maxCreditLine(), "Should not exceed max");
    }

    function test_calculateCreditLine_moreRevenue_higherCredit() public {
        address agent2 = makeAddr("agent2");

        // Agent 1: low revenue
        uint256 id1 = _registerAgent(agentWallet, 1_000e6);

        // Agent 2: high revenue
        uint256 id2 = _registerAgent(agent2, 100_000e6);

        (uint256 limit1,) = scorer.calculateCreditLine(id1);
        (uint256 limit2,) = scorer.calculateCreditLine(id2);

        assertGe(limit2, limit1, "Higher revenue should give higher credit limit");
    }

    function test_calculateCreditLine_consistencyMatters() public {
        address agent2 = makeAddr("agent2");

        // Agent 1: revenue in 1 epoch only
        uint256 id1 = _registerAgent(agentWallet, 10_000e6);

        // Agent 2: revenue spread across 3 epochs (more consistent)
        uint256 id2 = _registerAgent(agent2, 0);
        address lockbox2Addr = factory.getLockbox(id2);

        // Epoch 0
        usdt.mint(lockbox2Addr, 3_000e6);
        vm.prank(agent2);
        RevenueLockbox(payable(lockbox2Addr)).processRevenue();

        // Epoch 1
        vm.warp(block.timestamp + 31 days);
        usdt.mint(lockbox2Addr, 3_500e6);
        vm.prank(agent2);
        RevenueLockbox(payable(lockbox2Addr)).processRevenue();

        // Epoch 2
        vm.warp(block.timestamp + 31 days);
        usdt.mint(lockbox2Addr, 3_500e6);
        vm.prank(agent2);
        RevenueLockbox(payable(lockbox2Addr)).processRevenue();

        (uint256 limit1,) = scorer.calculateCreditLine(id1);
        (uint256 limit2,) = scorer.calculateCreditLine(id2);

        // Agent 2 has similar total revenue but across 3 epochs — should score better overall
        // (consistency score: 3/3 = 100% vs 1/1 = 50% for first-epoch-only)
        assertGe(limit2, limit1, "Consistent revenue should give higher credit");
    }

    function test_calculateCreditLine_creditHistoryBoosts() public {
        address agent2 = makeAddr("agent2");

        // Both agents same revenue
        uint256 id1 = _registerAgent(agentWallet, 10_000e6);
        uint256 id2 = _registerAgent(agent2, 10_000e6);

        // Set up credit line on vaults
        factory.setVaultCreditLine(id1, address(creditLine));
        factory.setVaultCreditLine(id2, address(creditLine));

        // Seed vault with liquidity for agent 2
        address vaultAddr2 = factory.getVault(id2);
        usdt.mint(address(this), 200_000e6);
        usdt.approve(vaultAddr2, 200_000e6);
        AgentVault(vaultAddr2).deposit(200_000e6, address(this));

        // Agent 2 completes a loan cycle (borrow + full repay)
        creditLine.refreshCreditLine(id2);
        vm.prank(agent2);
        creditLine.drawdown(id2, 1000e6);

        usdt.mint(agent2, 1000e6);
        vm.startPrank(agent2);
        usdt.approve(address(creditLine), 1000e6);
        creditLine.repay(id2, 1000e6);
        vm.stopPrank();

        (uint256 limit1,) = scorer.calculateCreditLine(id1);
        (uint256 limit2,) = scorer.calculateCreditLine(id2);

        assertGt(limit2, limit1, "Agent with credit history should get higher limit");
    }

    // ── Parameters ──────────────────────────────────────────────

    function test_setParameters_success() public {
        scorer.setParameters(50e6, 200_000e6, 200, 3000, 400, 100e6);

        assertEq(scorer.minCreditLine(), 50e6);
        assertEq(scorer.maxCreditLine(), 200_000e6);
        assertEq(scorer.minRateBps(), 200);
        assertEq(scorer.maxRateBps(), 3000);
        assertEq(scorer.revenueMultiplier(), 400);
        assertEq(scorer.minEpochRevenue(), 100e6);
    }

    function test_setParameters_revertsOnInvalidCreditRange() public {
        vm.expectRevert("CreditScorer: invalid credit range");
        scorer.setParameters(200_000e6, 50e6, 300, 2500, 300, 50e6);
    }

    function test_setParameters_revertsOnInvalidRateRange() public {
        vm.expectRevert("CreditScorer: invalid rate range");
        scorer.setParameters(100e6, 100_000e6, 2500, 300, 300, 50e6);
    }

    function test_setParameters_revertsOnRateTooHigh() public {
        vm.expectRevert("CreditScorer: rate too high");
        scorer.setParameters(100e6, 100_000e6, 300, 10001, 300, 50e6);
    }

    function test_setParameters_onlyOwner() public {
        vm.prank(makeAddr("nonOwner"));
        vm.expectRevert();
        scorer.setParameters(50e6, 200_000e6, 200, 3000, 400, 50e6);
    }

    // ── Rate clamping ───────────────────────────────────────────

    function test_rateClamped_withinBounds() public {
        uint256 agentId = _registerAgent(agentWallet, 10_000e6);

        (, uint256 rateBps) = scorer.calculateCreditLine(agentId);

        assertGe(rateBps, scorer.minRateBps(), "Rate should be >= min");
        assertLe(rateBps, scorer.maxRateBps(), "Rate should be <= max");
    }

    function test_creditClamped_withinBounds() public {
        uint256 agentId = _registerAgent(agentWallet, 10_000e6);

        (uint256 limit,) = scorer.calculateCreditLine(agentId);

        assertGe(limit, scorer.minCreditLine(), "Credit should be >= min");
        assertLe(limit, scorer.maxCreditLine(), "Credit should be <= max");
    }

    // ── Epoch tracking ──────────────────────────────────────────

    function test_epochTracking_recordsRevenue() public {
        uint256 agentId = _registerAgent(agentWallet, 5_000e6);
        address lockboxAddr = factory.getLockbox(agentId);
        RevenueLockbox lockbox = RevenueLockbox(payable(lockboxAddr));

        assertEq(lockbox.epochsWithRevenue(), 1, "First epoch recorded");
        assertGt(lockbox.revenueByEpoch(0), 0, "Epoch 0 has revenue");
    }

    function test_epochTracking_multipleEpochs() public {
        uint256 agentId = _registerAgent(agentWallet, 1_000e6);
        address lockboxAddr = factory.getLockbox(agentId);
        RevenueLockbox lockbox = RevenueLockbox(payable(lockboxAddr));

        // Advance to epoch 1
        vm.warp(block.timestamp + 31 days);
        usdt.mint(lockboxAddr, 2_000e6);
        vm.prank(agentWallet);
        lockbox.processRevenue();

        assertEq(lockbox.epochsWithRevenue(), 2, "Two epochs with revenue");
        assertEq(lockbox.currentEpoch(), 1, "Now in epoch 1");
    }

    // ── Composite score ─────────────────────────────────────────

    function test_getCompositeScore_matchesCreditLineCalc() public {
        uint256 agentId = _registerAgent(agentWallet, 10_000e6);

        uint256 compositeScore = scorer.getCompositeScore(agentId);

        // Score should be between 0 and 100
        assertLe(compositeScore, 100, "Composite score should be <= 100");

        // Verify consistency: credit line from calculateCreditLine should match
        // the formula: minCreditLine + (compositeScore * range) / 100
        (uint256 creditLimit,) = scorer.calculateCreditLine(agentId);
        uint256 expectedLimit =
            scorer.minCreditLine() + (compositeScore * (scorer.maxCreditLine() - scorer.minCreditLine())) / 100;
        // Clamp expected
        if (expectedLimit < scorer.minCreditLine()) expectedLimit = scorer.minCreditLine();
        if (expectedLimit > scorer.maxCreditLine()) expectedLimit = scorer.maxCreditLine();
        assertEq(creditLimit, expectedLimit, "Credit limit should match composite score formula");
    }

    function test_getCompositeScore_revertsWithoutLockbox() public {
        AgentRegistry reg2 = new AgentRegistry(owner);
        CreditScorer scorer2 = new CreditScorer(address(reg2), owner);
        uint256 agentId =
            reg2.registerAgent(agentWallet, keccak256("code"), "Test Agent", address(0), 0, bytes32(0), address(0));

        vm.expectRevert("CreditScorer: no lockbox");
        scorer2.getCompositeScore(agentId);
    }

    function test_getCompositeScore_higherRevenue_higherScore() public {
        address agent2 = makeAddr("agent2");

        uint256 id1 = _registerAgent(agentWallet, 1_000e6);
        uint256 id2 = _registerAgent(agent2, 100_000e6);

        uint256 score1 = scorer.getCompositeScore(id1);
        uint256 score2 = scorer.getCompositeScore(id2);

        assertGe(score2, score1, "Higher revenue should give higher composite score");
    }
}
