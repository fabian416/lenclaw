// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ERC20Mock} from "./mocks/ERC20Mock.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {RevenueLockbox} from "../src/RevenueLockbox.sol";
import {AgentCreditLine} from "../src/AgentCreditLine.sol";
import {LenclawVault} from "../src/LenclawVault.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Integration Test - Full lending protocol flow
/// @notice Tests the complete lifecycle: register agent -> get credit -> borrow -> earn revenue -> auto-repay
contract IntegrationTest is Test {
    ERC20Mock public usdc;
    AgentRegistry public registry;
    CreditScorer public scorer;
    LenclawVault public vault;
    AgentCreditLine public creditLine;

    address public owner = address(this);
    address public agentWallet = makeAddr("agent");
    address public depositorA = makeAddr("depositorA");
    address public depositorB = makeAddr("depositorB");

    function setUp() public {
        // Deploy protocol
        usdc = new ERC20Mock("USD Coin", "USDC", 6);
        registry = new AgentRegistry(owner);
        vault = new LenclawVault(IERC20(address(usdc)), owner);
        scorer = new CreditScorer(address(registry), owner);
        creditLine = new AgentCreditLine(
            address(usdc), address(registry), address(scorer), address(vault), owner
        );

        vault.authorizeBorrower(address(creditLine), true);

        // Fund depositors
        usdc.mint(depositorA, 500_000e6);
        usdc.mint(depositorB, 200_000e6);

        // Approve vault
        vm.prank(depositorA);
        usdc.approve(address(vault), type(uint256).max);
        vm.prank(depositorB);
        usdc.approve(address(vault), type(uint256).max);

        // Seed vault with deposits
        vm.prank(depositorA);
        vault.deposit(500_000e6, depositorA);
        vm.prank(depositorB);
        vault.deposit(200_000e6, depositorB);

        // Approve vault for credit line transfers
        vm.prank(address(vault));
        usdc.approve(address(creditLine), type(uint256).max);
    }

    /// @notice Full lifecycle: register -> revenue -> credit -> borrow -> repay
    function test_fullLifecycle() public {
        // 1. Register agent
        bytes32 codeHash = keccak256("autonomous-trading-agent-v1");
        uint256 agentId = registry.registerAgent(agentWallet, codeHash, "AutoTrader-v3");
        assertTrue(registry.isRegistered(agentId), "Agent should be registered");

        // 2. Deploy RevenueLockbox for agent
        RevenueLockbox lockbox = new RevenueLockbox(
            agentWallet, address(vault), agentId, address(usdc), 5000 // 50% repayment
        );
        registry.setLockbox(agentId, address(lockbox));

        // 3. Agent earns revenue (simulated by minting USDC to lockbox)
        usdc.mint(address(lockbox), 20_000e6);
        lockbox.processRevenue();

        // Verify revenue split
        assertEq(lockbox.totalRevenueCapture(), 20_000e6, "Revenue captured");
        assertEq(lockbox.totalRepaid(), 10_000e6, "50% repaid to vault");

        // 4. Verify code and boost reputation
        registry.verifyCode(agentId, keccak256("verified-code-v1"), "tee-attestation");
        registry.updateReputation(agentId, 800);

        // 5. Get credit line
        creditLine.refreshCreditLine(agentId);
        (,,,, uint256 creditLimit,) = creditLine.facilities(agentId);
        assertGt(creditLimit, 0, "Credit limit should be > 0");

        // 6. Agent borrows
        uint256 borrowAmount = 5000e6;
        require(borrowAmount <= creditLimit, "Borrow exceeds credit");

        vm.prank(agentWallet);
        creditLine.drawdown(agentId, borrowAmount);
        assertGe(usdc.balanceOf(agentWallet), borrowAmount, "Agent received USDC");

        // 7. Verify outstanding debt
        uint256 outstanding = creditLine.getOutstanding(agentId);
        assertGe(outstanding, borrowAmount, "Outstanding >= borrow amount");

        // 8. Time passes, interest accrues
        vm.warp(block.timestamp + 30 days);
        uint256 outstandingWithInterest = creditLine.getOutstanding(agentId);
        assertGt(outstandingWithInterest, borrowAmount, "Interest accrued");

        // 9. Agent earns more revenue and repays
        usdc.mint(agentWallet, outstandingWithInterest);
        vm.startPrank(agentWallet);
        usdc.approve(address(creditLine), outstandingWithInterest);
        creditLine.repay(agentId, outstandingWithInterest);
        vm.stopPrank();

        // 10. Verify fully repaid
        assertEq(creditLine.getOutstanding(agentId), 0, "Fully repaid");
        assertEq(uint8(creditLine.getStatus(agentId)), uint8(AgentCreditLine.Status.ACTIVE));
    }

    /// @notice Test delinquency to default flow
    function test_delinquencyToDefaultFlow() public {
        // Register and setup agent
        uint256 agentId = registry.registerAgent(agentWallet, keccak256("code"), "BadAgent");
        RevenueLockbox lockbox = new RevenueLockbox(
            agentWallet, address(vault), agentId, address(usdc), 5000
        );
        registry.setLockbox(agentId, address(lockbox));
        usdc.mint(address(lockbox), 20_000e6);
        lockbox.processRevenue();

        // Grant credit line contract protocol role to slash reputation on default
        registry.setProtocol(address(creditLine));

        creditLine.refreshCreditLine(agentId);

        // Borrow
        vm.prank(agentWallet);
        creditLine.drawdown(agentId, 1000e6);

        // Active
        assertEq(uint8(creditLine.getStatus(agentId)), uint8(AgentCreditLine.Status.ACTIVE));

        // Grace period passes -> delinquent
        vm.warp(block.timestamp + 8 days);
        creditLine.updateStatus(agentId);
        assertEq(uint8(creditLine.getStatus(agentId)), uint8(AgentCreditLine.Status.DELINQUENT));

        // Delinquency period passes -> default
        vm.warp(block.timestamp + 31 days);
        creditLine.updateStatus(agentId);
        assertEq(uint8(creditLine.getStatus(agentId)), uint8(AgentCreditLine.Status.DEFAULT));

        // Reputation should be slashed to 0
        assertEq(registry.getAgent(agentId).reputationScore, 0, "Reputation slashed");
    }

    /// @notice Test multiple depositors with vault shares
    function test_multipleDepositorsSharePrice() public {
        // Both depositors already deposited in setUp
        uint256 sharesA = vault.balanceOf(depositorA);
        uint256 sharesB = vault.balanceOf(depositorB);

        assertGt(sharesA, 0, "Depositor A has shares");
        assertGt(sharesB, 0, "Depositor B has shares");

        // Depositor A has more shares (deposited more)
        assertGt(sharesA, sharesB, "A deposited more");

        // Total assets = 700k
        assertEq(vault.totalAssets(), 700_000e6, "Total assets");
    }

    /// @notice Test revenue lockbox immutability - multiple processings
    function test_lockboxRevenueAccumulation() public {
        uint256 agentId_ = registry.registerAgent(agentWallet, keccak256("code"), "Agent");
        RevenueLockbox lockbox = new RevenueLockbox(
            agentWallet, address(vault), agentId_, address(usdc), 5000
        );

        // Process 3 rounds of revenue
        usdc.mint(address(lockbox), 1000e6);
        lockbox.processRevenue();

        usdc.mint(address(lockbox), 2000e6);
        lockbox.processRevenue();

        usdc.mint(address(lockbox), 3000e6);
        lockbox.processRevenue();

        assertEq(lockbox.totalRevenueCapture(), 6000e6, "Total revenue accumulated");
        assertEq(lockbox.totalRepaid(), 3000e6, "Total repaid");
    }
}
