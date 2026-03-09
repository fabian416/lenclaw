// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract MockUSDC6 is IERC20 {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract AgentVaultTest is Test {
    MockUSDC6 usdc;
    AgentRegistry registry;
    AgentVaultFactory factory;

    address owner = address(this);
    address backer1 = makeAddr("backer1");
    address backer2 = makeAddr("backer2");
    address agentWallet = makeAddr("agentWallet");

    uint256 agentId;
    AgentVault vault;

    function setUp() public {
        usdc = new MockUSDC6();
        registry = new AgentRegistry(owner);
        factory = new AgentVaultFactory(address(registry), owner);
        factory.setAllowedAsset(address(usdc), true);
        registry.setVaultFactory(address(factory));

        // Register an agent
        agentId = registry.registerAgent(agentWallet, keccak256("code_v1"), "TestAgent", address(0), 0, bytes32(0), address(0));

        // Create vault via factory
        address vaultAddr = factory.createVault(agentId, address(usdc));
        vault = AgentVault(vaultAddr);

        // Fund backers
        usdc.mint(backer1, 100_000e6);
        usdc.mint(backer2, 100_000e6);
    }

    function test_vaultCreation() public view {
        assertEq(vault.agentId(), agentId);
        assertEq(vault.factory(), address(factory));
        assertEq(vault.asset(), address(usdc));
        assertEq(vault.totalAssets(), 0);
        assertEq(vault.depositCap(), 500_000e6);
    }

    function test_vaultNameAndSymbol() public view {
        assertEq(vault.name(), "Lenclaw Agent 1 Vault");
        assertEq(vault.symbol(), "lcA1");
    }

    function test_deposit() public {
        uint256 depositAmount = 10_000e6;

        vm.startPrank(backer1);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, backer1);
        vm.stopPrank();

        assertGt(shares, 0, "Should receive shares");
        assertEq(vault.balanceOf(backer1), shares);
        assertEq(vault.totalAssets(), depositAmount);
    }

    function test_withdraw() public {
        uint256 depositAmount = 10_000e6;

        vm.startPrank(backer1);
        usdc.approve(address(vault), depositAmount);
        uint256 shares = vault.deposit(depositAmount, backer1);
        vault.approve(address(vault), shares);

        // Must request withdrawal and wait
        vault.requestWithdrawal();
        vm.warp(block.timestamp + 1 days + 1);

        uint256 assets = vault.redeem(shares, backer1, backer1);
        vm.stopPrank();

        assertEq(assets, depositAmount, "Should get back full deposit");
        assertEq(usdc.balanceOf(backer1), 100_000e6, "USDC balance restored");
    }

    function test_multipleBackers() public {
        vm.startPrank(backer1);
        usdc.approve(address(vault), 5_000e6);
        vault.deposit(5_000e6, backer1);
        vm.stopPrank();

        vm.startPrank(backer2);
        usdc.approve(address(vault), 15_000e6);
        vault.deposit(15_000e6, backer2);
        vm.stopPrank();

        assertEq(vault.totalAssets(), 20_000e6);
    }

    function test_borrowOnlyCreditLine() public {
        // Deposit first
        vm.startPrank(backer1);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, backer1);
        vm.stopPrank();

        // Unauthorized borrow should fail
        vm.expectRevert(AgentVault.NotCreditLine.selector);
        vault.borrow(agentWallet, 1_000e6);
    }

    function test_borrowWithCreditLine() public {
        // Set up credit line
        address creditLine = makeAddr("creditLine");
        factory.setVaultCreditLine(agentId, creditLine);

        // Deposit
        vm.startPrank(backer1);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, backer1);
        vm.stopPrank();

        // Borrow as credit line
        vm.prank(creditLine);
        vault.borrow(agentWallet, 3_000e6);

        assertEq(vault.totalBorrowed(), 3_000e6);
        assertEq(usdc.balanceOf(agentWallet), 3_000e6);
        assertEq(vault.totalAssets(), 10_000e6); // assets unchanged (balance + borrowed)
    }

    function test_borrowInsufficientLiquidity() public {
        address creditLine = makeAddr("creditLine");
        factory.setVaultCreditLine(agentId, creditLine);

        vm.startPrank(backer1);
        usdc.approve(address(vault), 1_000e6);
        vault.deposit(1_000e6, backer1);
        vm.stopPrank();

        vm.prank(creditLine);
        vm.expectRevert(AgentVault.InsufficientLiquidity.selector);
        vault.borrow(agentWallet, 2_000e6);
    }

    function test_receiveRepayment() public {
        address creditLine = makeAddr("creditLine");
        factory.setVaultCreditLine(agentId, creditLine);

        // Deposit and borrow
        vm.startPrank(backer1);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, backer1);
        vm.stopPrank();

        vm.prank(creditLine);
        vault.borrow(agentWallet, 5_000e6);

        // Repay from credit line (authorized caller)
        usdc.mint(creditLine, 5_000e6);
        vm.startPrank(creditLine);
        usdc.approve(address(vault), 5_000e6);
        vault.receiveRepayment(5_000e6, 0);
        vm.stopPrank();

        assertEq(vault.totalBorrowed(), 0);
        assertEq(vault.totalRevenueReceived(), 5_000e6);
    }

    function test_receiveRepayment_revertsForUnauthorized() public {
        address creditLine = makeAddr("creditLine");
        factory.setVaultCreditLine(agentId, creditLine);

        vm.startPrank(backer1);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, backer1);
        vm.stopPrank();

        // Random address cannot call receiveRepayment
        address random = makeAddr("random");
        usdc.mint(random, 1_000e6);
        vm.startPrank(random);
        usdc.approve(address(vault), 1_000e6);
        vm.expectRevert(AgentVault.NotCreditLineOrLockbox.selector);
        vault.receiveRepayment(1_000e6, 0);
        vm.stopPrank();
    }

    function test_protocolFees() public {
        address creditLine = makeAddr("creditLine");
        factory.setVaultCreditLine(agentId, creditLine);

        vm.startPrank(backer1);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, backer1);
        vm.stopPrank();

        vm.prank(creditLine);
        vault.borrow(agentWallet, 5_000e6);

        // Repay 1000 USDC where 200 is interest
        // Fee should be 10% of interest only = 20 USDC (not 10% of 1000)
        usdc.mint(creditLine, 1_000e6);
        vm.startPrank(creditLine);
        usdc.approve(address(vault), 1_000e6);
        vault.receiveRepayment(1_000e6, 200e6);
        vm.stopPrank();

        // 10% fee on 200 interest = 20 USDC
        assertEq(vault.accumulatedFees(), 20e6);

        // Collect fees
        address treasury = makeAddr("treasury");
        factory.collectVaultFees(agentId, treasury);
        assertEq(usdc.balanceOf(treasury), 20e6);
        assertEq(vault.accumulatedFees(), 0);
    }

    function test_protocolFees_zeroOnPrincipalOnly() public {
        address creditLine = makeAddr("creditLine");
        factory.setVaultCreditLine(agentId, creditLine);

        vm.startPrank(backer1);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, backer1);
        vm.stopPrank();

        vm.prank(creditLine);
        vault.borrow(agentWallet, 5_000e6);

        // Repay 1000 USDC with 0 interest → no fee
        usdc.mint(creditLine, 1_000e6);
        vm.startPrank(creditLine);
        usdc.approve(address(vault), 1_000e6);
        vault.receiveRepayment(1_000e6, 0);
        vm.stopPrank();

        assertEq(vault.accumulatedFees(), 0, "No fee on principal-only repayment");
    }

    function test_depositCap() public {
        // Set a low cap
        factory.setVaultDepositCap(agentId, 5_000e6);

        vm.startPrank(backer1);
        usdc.approve(address(vault), 10_000e6);

        // First deposit within cap
        vault.deposit(3_000e6, backer1);

        // Second deposit exceeds cap
        vm.expectRevert(AgentVault.DepositCapExceeded.selector);
        vault.deposit(3_000e6, backer1);
        vm.stopPrank();
    }

    function test_utilizationRate() public {
        address creditLine = makeAddr("creditLine");
        factory.setVaultCreditLine(agentId, creditLine);

        vm.startPrank(backer1);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(10_000e6, backer1);
        vm.stopPrank();

        assertEq(vault.utilizationRate(), 0);

        vm.prank(creditLine);
        vault.borrow(agentWallet, 5_000e6);

        assertEq(vault.utilizationRate(), 5000); // 50%
    }

    function test_yieldAccrualForBackers() public {
        address creditLine = makeAddr("creditLine");
        factory.setVaultCreditLine(agentId, creditLine);

        // Backer deposits 10k
        vm.startPrank(backer1);
        usdc.approve(address(vault), 10_000e6);
        uint256 shares = vault.deposit(10_000e6, backer1);
        vm.stopPrank();

        // Agent borrows 5k
        vm.prank(creditLine);
        vault.borrow(agentWallet, 5_000e6);

        // Agent repays 5500 (5000 principal + 500 interest)
        usdc.mint(creditLine, 5_500e6);
        vm.startPrank(creditLine);
        usdc.approve(address(vault), 5_500e6);
        vault.receiveRepayment(5_500e6, 500e6);
        vm.stopPrank();

        // balance = 10000 - 5000 + 5500 = 10500
        // totalBorrowed went from 5000 to 0 (repaid 5500, capped at 5000 borrowed)
        // fees = 500 interest * 10% = 50 (fee only on interest, not principal!)
        // totalAssets = 10500 + 0 - 50 = 10450
        assertEq(vault.totalAssets(), 10_450e6);

        // Redeem all shares - backer gets ~10450 (yield of ~450 after fee)
        // ERC4626 virtual offset causes ±1 wei rounding
        vm.startPrank(backer1);
        vault.approve(address(vault), shares);
        vault.requestWithdrawal();
        vm.warp(block.timestamp + 1 days + 1);
        uint256 redeemed = vault.redeem(shares, backer1, backer1);
        vm.stopPrank();

        assertApproxEqAbs(redeemed, 10_450e6, 1);
    }

    function test_creditLineCanOnlyBeSetOnce() public {
        address creditLine1 = makeAddr("creditLine1");
        address creditLine2 = makeAddr("creditLine2");

        factory.setVaultCreditLine(agentId, creditLine1);

        vm.expectRevert(AgentVault.CreditLineAlreadySet.selector);
        factory.setVaultCreditLine(agentId, creditLine2);
    }

    function test_onlyFactoryCanSetCreditLine() public {
        vm.prank(backer1);
        vm.expectRevert(AgentVault.NotFactory.selector);
        vault.setCreditLine(makeAddr("creditLine"));
    }

    function test_onlyFactoryCanSetDepositCap() public {
        vm.prank(backer1);
        vm.expectRevert(AgentVault.NotFactory.selector);
        vault.setDepositCap(1_000_000e6);
    }

    function test_onlyFactoryCanCollectFees() public {
        vm.prank(backer1);
        vm.expectRevert(AgentVault.NotFactory.selector);
        vault.collectFees(backer1);
    }

    function test_mint_revertsWhenPaused() public {
        // Pause the vault via factory (pause() has onlyFactory modifier)
        vm.prank(address(factory));
        vault.pause();

        vm.startPrank(backer1);
        usdc.approve(address(vault), 10_000e6);

        // mint should revert when paused
        uint256 shares = vault.previewDeposit(10_000e6);
        vm.expectRevert(abi.encodeWithSelector(Pausable.EnforcedPause.selector));
        vault.mint(shares, backer1);
        vm.stopPrank();
    }

    function test_mint_revertsUnderMinDeposit() public {
        vm.startPrank(backer1);
        usdc.approve(address(vault), 10_000e6);

        // mint(1) should revert because the underlying assets are below MIN_DEPOSIT
        vm.expectRevert(AgentVault.DepositTooSmall.selector);
        vault.mint(1, backer1);
        vm.stopPrank();
    }
}
