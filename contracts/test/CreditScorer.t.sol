// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ERC20Mock} from "./mocks/ERC20Mock.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {RevenueLockbox} from "../src/RevenueLockbox.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CreditScorerTest is Test {
    ERC20Mock public usdc;
    AgentRegistry public registry;
    CreditScorer public scorer;
    AgentVaultFactory public factory;

    address public owner = address(this);
    address public agentWallet = makeAddr("agent");

    function setUp() public {
        usdc = new ERC20Mock("USD Coin", "USDC", 6);
        registry = new AgentRegistry(owner);
        scorer = new CreditScorer(address(registry), owner);
        factory = new AgentVaultFactory(address(usdc), address(registry), owner);
        registry.setVaultFactory(address(factory));
    }

    function _registerAgentWithLockbox(address wallet, uint256 revenue, uint256 repScore, bool verified)
        internal
        returns (uint256 agentId, RevenueLockbox lockbox)
    {
        bytes32 codeHash = keccak256(abi.encodePacked("code", wallet));
        agentId = registry.registerAgent(wallet, codeHash, "Test Agent", address(0), 0, bytes32(0));

        address vaultAddr = factory.getVault(agentId);

        lockbox = new RevenueLockbox(wallet, vaultAddr, agentId, address(usdc), 5000, address(0));
        registry.setLockbox(agentId, address(lockbox));

        // Simulate revenue
        if (revenue > 0) {
            usdc.mint(address(lockbox), revenue);
            vm.prank(wallet);
            lockbox.processRevenue();
        }

        // Set reputation
        registry.updateReputation(agentId, repScore);

        // Verify code if requested
        if (verified) {
            registry.verifyCode(agentId, keccak256("verified-code"), "attestation");
        }
    }

    // ── Credit line calculation ──────────────────────────────────

    function test_calculateCreditLine_withRevenue() public {
        (uint256 agentId,) = _registerAgentWithLockbox(agentWallet, 10_000e6, 500, false);

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
        uint256 agentId = reg2.registerAgent(agentWallet, keccak256("code"), "Test Agent", address(0), 0, bytes32(0));

        vm.expectRevert("CreditScorer: no lockbox");
        scorer2.calculateCreditLine(agentId);
    }

    function test_calculateCreditLine_zeroRevenue_getsAboveMinCreditLine() public {
        (uint256 agentId,) = _registerAgentWithLockbox(agentWallet, 0, 500, false);

        (uint256 creditLimit,) = scorer.calculateCreditLine(agentId);

        // Zero revenue but reputation (500/1000) still contributes via weighted scoring
        assertGe(creditLimit, scorer.minCreditLine(), "Should be at least min credit line");
        assertLe(creditLimit, scorer.maxCreditLine(), "Should not exceed max");
    }

    function test_calculateCreditLine_moreRevenue_higherCredit() public {
        address agent2 = makeAddr("agent2");

        // Agent 1: low revenue
        (uint256 id1,) = _registerAgentWithLockbox(agentWallet, 1_000e6, 500, false);

        // Agent 2: high revenue
        (uint256 id2,) = _registerAgentWithLockbox(agent2, 100_000e6, 500, false);

        (uint256 limit1,) = scorer.calculateCreditLine(id1);
        (uint256 limit2,) = scorer.calculateCreditLine(id2);

        assertGe(limit2, limit1, "Higher revenue should give higher credit limit");
    }

    function test_calculateCreditLine_higherReputation_lowerRate() public {
        address agent2 = makeAddr("agent2");

        // Agent 1: low reputation
        (uint256 id1,) = _registerAgentWithLockbox(agentWallet, 10_000e6, 100, false);

        // Agent 2: high reputation
        (uint256 id2,) = _registerAgentWithLockbox(agent2, 10_000e6, 900, false);

        (, uint256 rate1) = scorer.calculateCreditLine(id1);
        (, uint256 rate2) = scorer.calculateCreditLine(id2);

        assertLe(rate2, rate1, "Higher reputation should give lower interest rate");
    }

    function test_calculateCreditLine_codeVerified_bonus() public {
        address agent2 = makeAddr("agent2");

        // Unverified agent
        (uint256 id1,) = _registerAgentWithLockbox(agentWallet, 10_000e6, 500, false);

        // Verified agent (same revenue/reputation)
        (uint256 id2,) = _registerAgentWithLockbox(agent2, 10_000e6, 500, true);

        (uint256 limit1,) = scorer.calculateCreditLine(id1);
        (uint256 limit2,) = scorer.calculateCreditLine(id2);

        assertGt(limit2, limit1, "Verified agent should get higher credit limit");
    }

    // ── Parameters ──────────────────────────────────────────────

    function test_setParameters_success() public {
        scorer.setParameters(50e6, 200_000e6, 200, 3000, 400);

        assertEq(scorer.minCreditLine(), 50e6);
        assertEq(scorer.maxCreditLine(), 200_000e6);
        assertEq(scorer.minRateBps(), 200);
        assertEq(scorer.maxRateBps(), 3000);
        assertEq(scorer.revenueMultiplier(), 400);
    }

    function test_setParameters_revertsOnInvalidCreditRange() public {
        vm.expectRevert("CreditScorer: invalid credit range");
        scorer.setParameters(200_000e6, 50e6, 300, 2500, 300);
    }

    function test_setParameters_revertsOnInvalidRateRange() public {
        vm.expectRevert("CreditScorer: invalid rate range");
        scorer.setParameters(100e6, 100_000e6, 2500, 300, 300);
    }

    function test_setParameters_revertsOnRateTooHigh() public {
        vm.expectRevert("CreditScorer: rate too high");
        scorer.setParameters(100e6, 100_000e6, 300, 10001, 300);
    }

    function test_setParameters_onlyOwner() public {
        vm.prank(makeAddr("nonOwner"));
        vm.expectRevert();
        scorer.setParameters(50e6, 200_000e6, 200, 3000, 400);
    }

    // ── Rate clamping ───────────────────────────────────────────

    function test_rateClamped_withinBounds() public {
        (uint256 agentId,) = _registerAgentWithLockbox(agentWallet, 10_000e6, 500, false);

        (, uint256 rateBps) = scorer.calculateCreditLine(agentId);

        assertGe(rateBps, scorer.minRateBps(), "Rate should be >= min");
        assertLe(rateBps, scorer.maxRateBps(), "Rate should be <= max");
    }

    function test_creditClamped_withinBounds() public {
        (uint256 agentId,) = _registerAgentWithLockbox(agentWallet, 10_000e6, 500, false);

        (uint256 limit,) = scorer.calculateCreditLine(agentId);

        assertGe(limit, scorer.minCreditLine(), "Credit should be >= min");
        assertLe(limit, scorer.maxCreditLine(), "Credit should be <= max");
    }
}
