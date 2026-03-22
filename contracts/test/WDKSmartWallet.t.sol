// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20Mock} from "./mocks/ERC20Mock.sol";
import {WDKSmartWallet} from "../src/WDKSmartWallet.sol";
import {WDKWalletFactory} from "../src/WDKWalletFactory.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";
import {AgentVault} from "../src/AgentVault.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract WDKSmartWalletTest is Test {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    ERC20Mock usdc;
    AgentRegistry registry;
    AgentVaultFactory vaultFactory;
    WDKWalletFactory wdkFactory;

    address protocolOwner = address(this);
    address entryPoint = makeAddr("entryPoint");
    uint256 agentOwnerKey = 0xA11CE;
    address agentWallet;
    address backer = makeAddr("backer");

    uint256 agentId;
    address vaultAddr;
    address lockboxAddr;

    function setUp() public {
        agentWallet = vm.addr(agentOwnerKey);

        usdc = new ERC20Mock("USD Coin", "USDC", 6);
        registry = new AgentRegistry(protocolOwner);
        vaultFactory = new AgentVaultFactory(address(registry), protocolOwner);
        vaultFactory.setAllowedAsset(address(usdc), true);

        // Link registry to factory
        registry.setVaultFactory(address(vaultFactory));

        // Register agent (auto-deploys vault + lockbox + standard smartWallet)
        agentId = registry.registerAgent(
            agentWallet, keccak256("code"), "TestAgent", address(0), 0, bytes32(0), address(usdc)
        );
        vaultAddr = vaultFactory.getVault(agentId);
        lockboxAddr = vaultFactory.getLockbox(agentId);

        // Deploy WDK wallet factory
        wdkFactory = new WDKWalletFactory(address(usdc), address(registry), entryPoint, protocolOwner);

        // Authorize the WDK factory in the registry so it can call setSmartWallet
        registry.setAuthorizedFactory(address(wdkFactory), true);
    }

    // ─── Helper: create WDK wallet for the agent ────────────────────────

    function _createWDKWallet() internal returns (WDKSmartWallet wallet) {
        // Clear the smartWallet so WDK factory can set it
        // The standard smartWallet was already set by vaultFactory. For testing WDK,
        // we deploy a fresh agent without a pre-existing smart wallet.
        // Register a new agent without vault (no asset) to get a clean profile
        address agentWallet2 = makeAddr("agentWallet2");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("code2"), "TestAgent2", address(0), 0, bytes32(0), address(0)
        );

        // Manually set lockbox and vault for this agent (simulate partial setup)
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        // Create WDK wallet
        address walletAddr = wdkFactory.createWallet(newAgentId);
        wallet = WDKSmartWallet(payable(walletAddr));
    }

    // ─── Helper: deploy WDK wallet with known private key owner ─────────

    function _createWDKWalletWithKey() internal returns (WDKSmartWallet wallet, uint256 walletAgentId) {
        // Need a unique wallet address, use a different key
        uint256 key2 = 0xB0B;
        address agentWallet4 = vm.addr(key2);

        uint256 newAgentId = registry.registerAgent(
            agentWallet4, keccak256("code3"), "TestAgent3", address(0), 0, bytes32(0), address(0)
        );

        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        // Deploy WDK wallet — owner will be agentWallet4
        address walletAddr = wdkFactory.createWallet(newAgentId);
        wallet = WDKSmartWallet(payable(walletAddr));
        walletAgentId = newAgentId;
    }

    // ─── Factory Tests ──────────────────────────────────────────────────

    function test_createWDKWallet() public {
        WDKSmartWallet wallet = _createWDKWallet();
        assertTrue(address(wallet) != address(0), "Wallet should be deployed");
        assertTrue(wallet.isWDKWallet(), "Should be WDK wallet");
        assertEq(wallet.wdkVersion(), 1, "WDK version should be 1");
        assertEq(wallet.entryPoint(), entryPoint, "EntryPoint should match");
    }

    function test_createWDKWallet_registersInRegistry() public {
        address agentWallet2 = makeAddr("agentWallet2reg");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codereg"), "TestAgentReg", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);

        // Check registry has the smart wallet
        IAgentRegistryHelper.AgentProfile memory profile = IAgentRegistryHelper(address(registry)).getAgent(newAgentId);
        assertEq(profile.smartWallet, walletAddr, "Registry should have WDK wallet address");
    }

    function test_createWDKWallet_revertDuplicate() public {
        address agentWallet2 = makeAddr("agentWallet2dup");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codedup"), "TestAgentDup", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        wdkFactory.createWallet(newAgentId);

        vm.expectRevert(abi.encodeWithSelector(WDKWalletFactory.WalletAlreadyExists.selector, newAgentId));
        wdkFactory.createWallet(newAgentId);
    }

    function test_createWDKWallet_revertUnauthorized() public {
        address agentWallet2 = makeAddr("agentWallet2unauth");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codeunauth"), "TestAgentUnauth", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        vm.prank(backer);
        vm.expectRevert(WDKWalletFactory.NotAuthorized.selector);
        wdkFactory.createWallet(newAgentId);
    }

    function test_getAddress_predicts_correctly() public {
        address agentWallet2 = makeAddr("agentWallet2pred");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codepred"), "TestAgentPred", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        // Predict address before deployment
        address predicted = wdkFactory.getAddress(newAgentId, agentWallet2, lockboxAddr);

        // Deploy
        address actual = wdkFactory.createWallet(newAgentId);

        assertEq(predicted, actual, "Predicted address should match actual");
    }

    // ─── WDK Wallet Immutables ──────────────────────────────────────────

    function test_walletImmutables() public {
        WDKSmartWallet wallet = _createWDKWallet();

        assertEq(wallet.protocol(), address(wdkFactory));
        assertEq(wallet.lockbox(), lockboxAddr);
        assertEq(wallet.repaymentRateBps(), 5000); // default 50%
        assertEq(wallet.entryPoint(), entryPoint);
        assertTrue(wallet.isWDKWallet());
        assertEq(wallet.wdkVersion(), 1);
    }

    // ─── Revenue Routing Tests ──────────────────────────────────────────

    function test_routeRevenue() public {
        WDKSmartWallet wallet = _createWDKWallet();
        address walletAddr = address(wallet);

        // Send USDC to the WDK wallet
        usdc.mint(walletAddr, 1000e6);

        // Route revenue (callable by anyone)
        wallet.routeRevenue();

        // 50% to lockbox, 50% remains in wallet
        assertEq(usdc.balanceOf(lockboxAddr), 500e6, "500 to lockbox");
        assertEq(usdc.balanceOf(walletAddr), 500e6, "500 remains in wallet");
        assertEq(wallet.totalRouted(), 500e6);
    }

    function test_routeRevenue_noBalance() public {
        WDKSmartWallet wallet = _createWDKWallet();

        // Should not revert with zero balance
        wallet.routeRevenue();
        assertEq(wallet.totalRouted(), 0);
    }

    function test_pendingRevenue() public {
        WDKSmartWallet wallet = _createWDKWallet();
        usdc.mint(address(wallet), 1000e6);

        (uint256 toLockbox, uint256 toAgent) = wallet.pendingRevenue();
        assertEq(toLockbox, 500e6);
        assertEq(toAgent, 500e6);
    }

    // ─── Execute Tests ──────────────────────────────────────────────────

    function test_execute_ownerCanExecute() public {
        address agentWallet2 = makeAddr("agentWalletExec");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codeexec"), "TestAgentExec", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(walletAddr));

        // Add allowed target
        address target = makeAddr("target");
        wdkFactory.addAllowedTarget(newAgentId, target);
        assertTrue(wallet.allowedTargets(target));

        // Owner can execute (target is an EOA so the call succeeds with empty data)
        vm.prank(agentWallet2);
        wallet.execute(target, 0, "");
    }

    function test_execute_entryPointCanExecute() public {
        address agentWallet2 = makeAddr("agentWalletEP");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codeep"), "TestAgentEP", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(walletAddr));

        address target = makeAddr("targetEP");
        wdkFactory.addAllowedTarget(newAgentId, target);

        // EntryPoint can execute
        vm.prank(entryPoint);
        wallet.execute(target, 0, "");
    }

    function test_execute_revertNotOwnerOrEntryPoint() public {
        WDKSmartWallet wallet = _createWDKWallet();
        address target = makeAddr("target");

        vm.prank(backer);
        vm.expectRevert(WDKSmartWallet.NotOwnerOrEntryPoint.selector);
        wallet.execute(target, 0, "");
    }

    function test_execute_revertTargetNotAllowed() public {
        address agentWallet2 = makeAddr("agentWalletTNA");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codetna"), "TestAgentTNA", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(walletAddr));

        address blockedTarget = makeAddr("blocked");

        vm.prank(agentWallet2);
        vm.expectRevert(WDKSmartWallet.TargetNotAllowed.selector);
        wallet.execute(blockedTarget, 0, "");
    }

    function test_execute_autoRoutesRevenue() public {
        address agentWallet2 = makeAddr("agentWalletAR");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codear"), "TestAgentAR", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(walletAddr));

        address target = makeAddr("targetAR");
        wdkFactory.addAllowedTarget(newAgentId, target);

        // Fund the wallet
        usdc.mint(walletAddr, 1000e6);

        // Execute should auto-route revenue first
        vm.prank(agentWallet2);
        wallet.execute(target, 0, "");

        // 50% routed to lockbox
        assertEq(wallet.totalRouted(), 500e6, "Revenue should be auto-routed");
    }

    // ─── Batch Execute Tests ────────────────────────────────────────────

    function test_executeBatch() public {
        address agentWallet2 = makeAddr("agentWalletBatch");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codebatch"), "TestAgentBatch", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(walletAddr));

        address target1 = makeAddr("batchTarget1");
        address target2 = makeAddr("batchTarget2");
        wdkFactory.addAllowedTarget(newAgentId, target1);
        wdkFactory.addAllowedTarget(newAgentId, target2);

        // Fund wallet
        usdc.mint(walletAddr, 500e6);

        address[] memory targets = new address[](2);
        targets[0] = target1;
        targets[1] = target2;

        uint256[] memory values = new uint256[](2);
        values[0] = 0;
        values[1] = 0;

        bytes[] memory datas = new bytes[](2);
        datas[0] = "";
        datas[1] = "";

        vm.prank(agentWallet2);
        wallet.executeBatch(targets, values, datas);

        // Revenue should have been routed before batch
        assertEq(wallet.totalRouted(), 250e6, "Revenue should be auto-routed before batch");
    }

    function test_executeBatch_entryPoint() public {
        address agentWallet2 = makeAddr("agentWalletBatchEP");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codebatchep"), "TestAgentBatchEP", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(walletAddr));

        address target = makeAddr("batchTargetEP");
        wdkFactory.addAllowedTarget(newAgentId, target);

        address[] memory targets = new address[](1);
        targets[0] = target;
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        bytes[] memory datas = new bytes[](1);
        datas[0] = "";

        // EntryPoint can batch execute
        vm.prank(entryPoint);
        wallet.executeBatch(targets, values, datas);
    }

    function test_executeBatch_revertLengthMismatch() public {
        address agentWallet2 = makeAddr("agentWalletBatchLM");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codebatchlm"), "TestAgentBatchLM", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(walletAddr));

        address[] memory targets = new address[](2);
        uint256[] memory values = new uint256[](1);
        bytes[] memory datas = new bytes[](2);

        vm.prank(agentWallet2);
        vm.expectRevert("length mismatch");
        wallet.executeBatch(targets, values, datas);
    }

    // ─── ERC-4337 validateUserOp Tests ──────────────────────────────────

    function test_validateUserOp_validSignature() public {
        uint256 ownerKey = 0xDEAD;
        address ownerAddr = vm.addr(ownerKey);

        // Register agent with this owner
        uint256 newAgentId = registry.registerAgent(
            ownerAddr, keccak256("codevuop"), "TestAgentVUOP", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(walletAddr));

        // Create a userOpHash and sign it
        bytes32 userOpHash = keccak256("test user op");
        bytes32 ethSignedHash = userOpHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        WDKSmartWallet.PackedUserOperation memory userOp = WDKSmartWallet.PackedUserOperation({
            sender: walletAddr,
            nonce: 0,
            initCode: "",
            callData: "",
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: signature
        });

        // Call from entryPoint
        vm.prank(entryPoint);
        uint256 validationData = wallet.validateUserOp(userOp, userOpHash, 0);

        assertEq(validationData, 0, "Validation should succeed (0 = valid)");
    }

    function test_validateUserOp_invalidSignature() public {
        uint256 ownerKey = 0xDEAD;
        address ownerAddr = vm.addr(ownerKey);

        uint256 newAgentId = registry.registerAgent(
            ownerAddr, keccak256("codeinvsig"), "TestAgentInvSig", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(walletAddr));

        bytes32 userOpHash = keccak256("test user op");

        // Sign with a DIFFERENT key (not the owner)
        uint256 wrongKey = 0xBAD;
        bytes32 ethSignedHash = userOpHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        WDKSmartWallet.PackedUserOperation memory userOp = WDKSmartWallet.PackedUserOperation({
            sender: walletAddr,
            nonce: 0,
            initCode: "",
            callData: "",
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: signature
        });

        vm.prank(entryPoint);
        uint256 validationData = wallet.validateUserOp(userOp, userOpHash, 0);

        assertEq(validationData, 1, "Validation should fail (1 = invalid)");
    }

    function test_validateUserOp_invalidSignatureLength() public {
        WDKSmartWallet wallet = _createWDKWallet();

        bytes32 userOpHash = keccak256("test");

        WDKSmartWallet.PackedUserOperation memory userOp = WDKSmartWallet.PackedUserOperation({
            sender: address(wallet),
            nonce: 0,
            initCode: "",
            callData: "",
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: hex"DEAD" // Only 2 bytes, not 65
        });

        vm.prank(entryPoint);
        uint256 validationData = wallet.validateUserOp(userOp, userOpHash, 0);
        assertEq(validationData, 1, "Should fail with short signature");
    }

    function test_validateUserOp_revertNotEntryPoint() public {
        WDKSmartWallet wallet = _createWDKWallet();

        bytes32 userOpHash = keccak256("test");
        WDKSmartWallet.PackedUserOperation memory userOp = WDKSmartWallet.PackedUserOperation({
            sender: address(wallet),
            nonce: 0,
            initCode: "",
            callData: "",
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: ""
        });

        vm.prank(backer);
        vm.expectRevert(WDKSmartWallet.NotEntryPoint.selector);
        wallet.validateUserOp(userOp, userOpHash, 0);
    }

    function test_validateUserOp_paysPrefund() public {
        uint256 ownerKey = 0xDEAD;
        address ownerAddr = vm.addr(ownerKey);

        uint256 newAgentId = registry.registerAgent(
            ownerAddr, keccak256("codeprefund"), "TestAgentPrefund", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(walletAddr));

        // Fund wallet with ETH for prefund
        vm.deal(walletAddr, 1 ether);

        bytes32 userOpHash = keccak256("test prefund");
        bytes32 ethSignedHash = userOpHash.toEthSignedMessageHash();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ownerKey, ethSignedHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        WDKSmartWallet.PackedUserOperation memory userOp = WDKSmartWallet.PackedUserOperation({
            sender: walletAddr,
            nonce: 0,
            initCode: "",
            callData: "",
            accountGasLimits: bytes32(0),
            preVerificationGas: 0,
            gasFees: bytes32(0),
            paymasterAndData: "",
            signature: signature
        });

        uint256 epBalanceBefore = entryPoint.balance;

        vm.prank(entryPoint);
        wallet.validateUserOp(userOp, userOpHash, 0.1 ether);

        assertEq(entryPoint.balance, epBalanceBefore + 0.1 ether, "EntryPoint should receive prefund");
    }

    // ─── Protocol Admin Tests ───────────────────────────────────────────

    function test_setRepaymentRate() public {
        address agentWallet2 = makeAddr("agentWalletRate");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("coderate"), "TestAgentRate", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        wdkFactory.createWallet(newAgentId);

        wdkFactory.setWalletRepaymentRate(newAgentId, 7000);

        WDKSmartWallet wallet = WDKSmartWallet(payable(wdkFactory.getWallet(newAgentId)));
        assertEq(wallet.repaymentRateBps(), 7000);
    }

    function test_setEntryPoint() public {
        address agentWallet2 = makeAddr("agentWalletSetEP");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codesetep"), "TestAgentSetEP", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        wdkFactory.createWallet(newAgentId);

        address newEntryPoint = makeAddr("newEntryPoint");
        wdkFactory.setWalletEntryPoint(newAgentId, newEntryPoint);

        WDKSmartWallet wallet = WDKSmartWallet(payable(wdkFactory.getWallet(newAgentId)));
        assertEq(wallet.entryPoint(), newEntryPoint);
    }

    function test_addRemoveAllowedTarget() public {
        address agentWallet2 = makeAddr("agentWalletTarget");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codetarget"), "TestAgentTarget", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(wdkFactory.getWallet(newAgentId)));

        address target = makeAddr("newTarget");
        wdkFactory.addAllowedTarget(newAgentId, target);
        assertTrue(wallet.allowedTargets(target));

        wdkFactory.removeAllowedTarget(newAgentId, target);
        assertFalse(wallet.allowedTargets(target));
    }

    function test_cannotAllowAssetToken() public {
        address agentWallet2 = makeAddr("agentWalletAsset");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codeasset"), "TestAgentAsset", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        wdkFactory.createWallet(newAgentId);

        vm.expectRevert("WDKSmartWallet: cannot allow asset token");
        wdkFactory.addAllowedTarget(newAgentId, address(usdc));
    }

    function test_cannotAllowLockbox() public {
        address agentWallet2 = makeAddr("agentWalletLB");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codelb"), "TestAgentLB", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(wdkFactory.getWallet(newAgentId)));

        // The lockbox stored immutably in the wallet is lockboxAddr
        assertEq(wallet.lockbox(), lockboxAddr, "lockbox should match");

        vm.expectRevert("WDKSmartWallet: cannot allow lockbox");
        wdkFactory.addAllowedTarget(newAgentId, lockboxAddr);
    }

    // ─── Lockbox Routing Enforced ───────────────────────────────────────

    function test_lockboxRoutingEnforced_onExecute() public {
        address agentWallet2 = makeAddr("agentWalletEnf");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codeenf"), "TestAgentEnf", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(walletAddr));

        address target = makeAddr("targetEnf");
        wdkFactory.addAllowedTarget(newAgentId, target);

        // Send revenue to wallet
        usdc.mint(walletAddr, 2000e6);

        uint256 lockboxBalanceBefore = usdc.balanceOf(lockboxAddr);

        // Execute triggers revenue routing
        vm.prank(agentWallet2);
        wallet.execute(target, 0, "");

        uint256 lockboxBalanceAfter = usdc.balanceOf(lockboxAddr);
        assertEq(lockboxBalanceAfter - lockboxBalanceBefore, 1000e6, "50% of 2000 = 1000 should go to lockbox");
    }

    function test_lockboxRoutingEnforced_onBatchExecute() public {
        address agentWallet2 = makeAddr("agentWalletBEnf");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codebatchenf"), "TestAgentBEnf", address(0), 0, bytes32(0), address(0)
        );
        registry.setLockbox(newAgentId, lockboxAddr);
        registry.setVault(newAgentId, vaultAddr);

        address walletAddr = wdkFactory.createWallet(newAgentId);
        WDKSmartWallet wallet = WDKSmartWallet(payable(walletAddr));

        address target = makeAddr("targetBEnf");
        wdkFactory.addAllowedTarget(newAgentId, target);

        // Send revenue
        usdc.mint(walletAddr, 800e6);

        uint256 lockboxBalanceBefore = usdc.balanceOf(lockboxAddr);

        address[] memory targets = new address[](1);
        targets[0] = target;
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        bytes[] memory datas = new bytes[](1);
        datas[0] = "";

        vm.prank(agentWallet2);
        wallet.executeBatch(targets, values, datas);

        uint256 lockboxBalanceAfter = usdc.balanceOf(lockboxAddr);
        assertEq(lockboxBalanceAfter - lockboxBalanceBefore, 400e6, "50% of 800 = 400 should go to lockbox");
    }

    // ─── Receive ETH ────────────────────────────────────────────────────

    function test_receiveETH() public {
        WDKSmartWallet wallet = _createWDKWallet();
        vm.deal(protocolOwner, 1 ether);
        (bool success,) = address(wallet).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(wallet).balance, 1 ether);
    }

    // ─── Registry WDK Flag ──────────────────────────────────────────────

    function test_registryWDKFlag() public {
        address agentWallet2 = makeAddr("agentWalletFlag");
        uint256 newAgentId = registry.registerAgent(
            agentWallet2, keccak256("codeflag"), "TestAgentFlag", address(0), 0, bytes32(0), address(0)
        );

        assertFalse(registry.isWDKWallet(newAgentId), "Should not be WDK by default");

        registry.setWDKWallet(newAgentId, true);
        assertTrue(registry.isWDKWallet(newAgentId), "Should be WDK after setting");
        assertTrue(registry.agentUsesWDKWallet(newAgentId), "agentUsesWDKWallet should return true");

        registry.setWDKWallet(newAgentId, false);
        assertFalse(registry.isWDKWallet(newAgentId), "Should be cleared after unsetting");
    }
}

// Helper interface to avoid import issues with struct
interface IAgentRegistryHelper {
    struct AgentProfile {
        address wallet;
        address smartWallet;
        bytes32 codeHash;
        string metadata;
        uint256 reputationScore;
        bool codeVerified;
        address lockbox;
        address vault;
        uint256 registeredAt;
        address externalToken;
        uint256 externalProtocolId;
        bytes32 agentCategory;
    }

    function getAgent(uint256 agentId) external view returns (AgentProfile memory);
}
