// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {LenclawVault} from "../src/LenclawVault.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {RevenueLockbox} from "../src/RevenueLockbox.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {AgentCreditLine} from "../src/AgentCreditLine.sol";
import {SeniorTranche} from "../src/SeniorTranche.sol";
import {JuniorTranche} from "../src/JuniorTranche.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract LenclawVaultTest is Test {
    MockUSDC usdc;
    LenclawVault vault;
    AgentRegistry registry;
    CreditScorer scorer;
    AgentCreditLine creditLine;
    SeniorTranche senior;
    JuniorTranche junior;

    address owner = address(this);
    address depositor = makeAddr("depositor");
    address agentWallet = makeAddr("agentWallet");

    function setUp() public {
        usdc = new MockUSDC();
        registry = new AgentRegistry(owner);
        vault = new LenclawVault(IERC20(address(usdc)), owner);
        scorer = new CreditScorer(address(registry), owner);
        creditLine = new AgentCreditLine(address(usdc), address(registry), address(scorer), address(vault), owner);
        senior = new SeniorTranche(IERC20(address(usdc)), address(vault), owner);
        junior = new JuniorTranche(IERC20(address(usdc)), address(vault), owner);

        vault.authorizeBorrower(address(creditLine), true);

        // Fund depositor
        usdc.mint(depositor, 100_000e6);
    }

    function test_deposit() public {
        uint256 depositAmount = 10_000e6;

        vm.startPrank(depositor);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, depositor);
        vm.stopPrank();

        assertGt(shares, 0, "Should receive shares");
        assertEq(vault.balanceOf(depositor), shares, "Share balance mismatch");
        assertEq(vault.totalAssets(), depositAmount, "Total assets mismatch");
    }

    function test_withdraw() public {
        uint256 depositAmount = 10_000e6;

        vm.startPrank(depositor);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, depositor);

        vault.approve(address(vault), shares);
        uint256 assets = vault.redeem(shares, depositor, depositor);
        vm.stopPrank();

        assertEq(assets, depositAmount, "Should get back full deposit");
        assertEq(usdc.balanceOf(depositor), 100_000e6, "USDC balance should be restored");
    }

    function test_agentRegistration() public {
        bytes32 codeHash = keccak256("agent_code_v1");
        uint256 agentId = registry.registerAgent(agentWallet, codeHash, "Test Agent");

        assertEq(agentId, 1, "First agent should have ID 1");
        assertTrue(registry.isRegistered(agentId), "Agent should be registered");

        AgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        assertEq(profile.wallet, agentWallet, "Wallet mismatch");
        assertEq(profile.codeHash, codeHash, "Code hash mismatch");
        assertEq(profile.reputationScore, 500, "Default reputation should be 500");
    }

    function test_revenueLockbox() public {
        // Register agent
        bytes32 codeHash = keccak256("agent_code_v1");
        uint256 agentId = registry.registerAgent(agentWallet, codeHash, "Test Agent");

        // Deploy lockbox
        RevenueLockbox lockbox =
            new RevenueLockbox(agentWallet, address(vault), agentId, address(usdc), 5000); // 50% repayment rate

        // Send revenue to lockbox
        usdc.mint(address(lockbox), 1000e6);

        // Process revenue
        lockbox.processRevenue();

        assertEq(lockbox.totalRevenueCapture(), 1000e6, "Revenue capture mismatch");
        assertEq(lockbox.totalRepaid(), 500e6, "Repaid mismatch");
        assertEq(usdc.balanceOf(address(vault)), 500e6, "Vault should receive repayment");
        assertEq(usdc.balanceOf(agentWallet), 500e6, "Agent should receive remainder");
    }

    function test_seniorTranche_deposit() public {
        uint256 depositAmount = 5000e6;

        vm.startPrank(depositor);
        usdc.approve(address(senior), depositAmount);
        uint256 shares = senior.deposit(depositAmount, depositor);
        vm.stopPrank();

        assertGt(shares, 0, "Should receive sUSDC shares");
        assertEq(senior.totalDeposited(), depositAmount, "Total deposited mismatch");
    }

    function test_juniorTranche_cooldown() public {
        uint256 depositAmount = 2000e6;

        vm.startPrank(depositor);
        usdc.approve(address(junior), depositAmount);
        uint256 shares = junior.deposit(depositAmount, depositor);

        // Try to withdraw without cooldown - should fail
        vm.expectRevert("JuniorTranche: cooldown not met");
        junior.redeem(shares, depositor, depositor);

        // Request withdrawal
        junior.requestWithdrawal(shares);

        // Still can't withdraw immediately
        vm.expectRevert("JuniorTranche: cooldown not met");
        junior.redeem(shares, depositor, depositor);

        // Warp past cooldown
        vm.warp(block.timestamp + 7 days + 1);

        // Now should succeed
        junior.redeem(shares, depositor, depositor);
        vm.stopPrank();

        assertEq(usdc.balanceOf(depositor), 100_000e6, "Should get full balance back");
    }

    function test_reputationUpdate() public {
        bytes32 codeHash = keccak256("agent_code_v1");
        uint256 agentId = registry.registerAgent(agentWallet, codeHash, "Test Agent");

        registry.updateReputation(agentId, 800);

        AgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        assertEq(profile.reputationScore, 800, "Reputation should be updated");
    }

    function test_codeVerification() public {
        bytes32 codeHash = keccak256("agent_code_v1");
        uint256 agentId = registry.registerAgent(agentWallet, codeHash, "Test Agent");

        bytes32 newHash = keccak256("agent_code_v2");
        bytes memory attestation = abi.encodePacked("tee_attestation_data");

        registry.verifyCode(agentId, newHash, attestation);

        AgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        assertTrue(profile.codeVerified, "Code should be verified");
        assertEq(profile.codeHash, newHash, "Code hash should be updated");
    }

    function test_utilizationRate() public {
        // Deposit into vault
        uint256 depositAmount = 10_000e6;
        vm.startPrank(depositor);
        usdc.approve(address(vault), depositAmount);
        vault.deposit(depositAmount, depositor);
        vm.stopPrank();

        assertEq(vault.utilizationRate(), 0, "Utilization should be 0 with no borrows");
    }
}
