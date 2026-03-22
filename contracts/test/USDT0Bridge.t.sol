// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ERC20Mock} from "./mocks/ERC20Mock.sol";
import {USDT0Bridge} from "../src/USDT0Bridge.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {AgentVaultFactory} from "../src/AgentVaultFactory.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Mock LZ endpoint that succeeds on send() and returns a quote on quoteSend()
contract MockLzEndpointSuccess {
    IERC20 public token;

    constructor(address _token) {
        token = IERC20(_token);
    }

    /// @dev Accepts the send call, pulls tokens from caller, always succeeds
    function send(USDT0Bridge.SendParam calldata, USDT0Bridge.MessagingFee calldata, address)
        external
        payable
        returns (bytes memory, bytes memory)
    {
        // Pull the approved tokens (simulates OFT burning/locking)
        uint256 allowance = token.allowance(msg.sender, address(this));
        if (allowance > 0) {
            token.transferFrom(msg.sender, address(this), allowance);
        }
        return ("", "");
    }

    /// @dev Returns a fixed fee for quoteSend
    function quoteSend(USDT0Bridge.SendParam calldata, bool)
        external
        pure
        returns (uint256 nativeFee, uint256 lzTokenFee)
    {
        return (0.01 ether, 0);
    }
}

/// @dev Mock LZ endpoint that always reverts on send()
contract MockLzEndpointFail {
    function send(USDT0Bridge.SendParam calldata, USDT0Bridge.MessagingFee calldata, address) external payable {
        revert("LZ send failed");
    }

    function quoteSend(USDT0Bridge.SendParam calldata, bool) external pure returns (uint256, uint256) {
        return (0, 0);
    }
}

/// @dev Mock LZ endpoint that reverts on quoteSend (simulates failure)
contract MockLzEndpointQuoteFail {
    function quoteSend(USDT0Bridge.SendParam calldata, bool) external pure {
        revert("quote failed");
    }
}

contract USDT0BridgeTest is Test {
    ERC20Mock usdt0;
    ERC20Mock otherToken;
    AgentRegistry registry;
    AgentVaultFactory vaultFactory;
    USDT0Bridge bridge;
    MockLzEndpointSuccess lzEndpoint;
    MockLzEndpointFail lzEndpointFail;

    address protocolOwner = address(this);
    address agentWallet = makeAddr("agentWallet");
    address recipient = makeAddr("recipient");
    address randomUser = makeAddr("randomUser");

    uint256 agentId;
    address lockboxAddr;

    uint32 constant DST_EID_ETHEREUM = 30101;
    uint32 constant DST_EID_ARBITRUM = 30110;

    function setUp() public {
        // Deploy tokens
        usdt0 = new ERC20Mock("USDT0", "USDT0", 6);
        otherToken = new ERC20Mock("Other", "OTH", 18);

        // Deploy registry and factory
        registry = new AgentRegistry(protocolOwner);
        vaultFactory = new AgentVaultFactory(address(registry), protocolOwner);
        vaultFactory.setAllowedAsset(address(usdt0), true);
        registry.setVaultFactory(address(vaultFactory));

        // Register agent (auto-deploys vault + lockbox)
        agentId = registry.registerAgent(
            agentWallet, keccak256("code"), "TestAgent", address(0), 0, bytes32(0), address(usdt0)
        );
        lockboxAddr = vaultFactory.getLockbox(agentId);

        // Deploy LZ mock endpoints
        lzEndpoint = new MockLzEndpointSuccess(address(usdt0));
        lzEndpointFail = new MockLzEndpointFail();

        // Deploy bridge with the success endpoint
        bridge = new USDT0Bridge(address(usdt0), address(registry), address(lzEndpoint), protocolOwner);

        // Enable destination chain
        bridge.setSupportedChain(DST_EID_ETHEREUM, true);

        // Fund agent wallet with USDT0
        usdt0.mint(agentWallet, 100_000e6);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 1. Deployment & Configuration
    // ═══════════════════════════════════════════════════════════════════

    function test_constructor_setsCorrectState() public view {
        assertEq(address(bridge.usdt0()), address(usdt0));
        assertEq(address(bridge.registry()), address(registry));
        assertEq(bridge.lzEndpoint(), address(lzEndpoint));
        assertEq(bridge.owner(), protocolOwner);
        assertEq(bridge.totalBridgedOut(), 0);
        assertEq(bridge.totalBridgedIn(), 0);
        assertEq(bridge.bridgeNonce(), 0);
    }

    function test_constructor_revertZeroUsdt0() public {
        vm.expectRevert("zero address");
        new USDT0Bridge(address(0), address(registry), address(lzEndpoint), protocolOwner);
    }

    function test_constructor_revertZeroRegistry() public {
        vm.expectRevert("zero address");
        new USDT0Bridge(address(usdt0), address(0), address(lzEndpoint), protocolOwner);
    }

    function test_constructor_allowsZeroLzEndpoint() public {
        USDT0Bridge b = new USDT0Bridge(address(usdt0), address(registry), address(0), protocolOwner);
        assertEq(b.lzEndpoint(), address(0));
    }

    function test_setLzEndpoint_onlyOwner() public {
        address newEndpoint = makeAddr("newEndpoint");
        bridge.setLzEndpoint(newEndpoint);
        assertEq(bridge.lzEndpoint(), newEndpoint);
    }

    function test_setLzEndpoint_revertNonOwner() public {
        vm.prank(randomUser);
        vm.expectRevert();
        bridge.setLzEndpoint(makeAddr("x"));
    }

    function test_setLzEndpoint_emitsEvent() public {
        address oldEndpoint = bridge.lzEndpoint();
        address newEndpoint = makeAddr("newEP");
        vm.expectEmit(true, true, false, false);
        emit USDT0Bridge.LzEndpointUpdated(oldEndpoint, newEndpoint);
        bridge.setLzEndpoint(newEndpoint);
    }

    function test_setSupportedChain_onlyOwner() public {
        bridge.setSupportedChain(DST_EID_ARBITRUM, true);
        assertTrue(bridge.supportedChains(DST_EID_ARBITRUM));

        bridge.setSupportedChain(DST_EID_ARBITRUM, false);
        assertFalse(bridge.supportedChains(DST_EID_ARBITRUM));
    }

    function test_setSupportedChain_revertNonOwner() public {
        vm.prank(randomUser);
        vm.expectRevert();
        bridge.setSupportedChain(DST_EID_ARBITRUM, true);
    }

    function test_setSupportedChain_emitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit USDT0Bridge.SupportedChainUpdated(DST_EID_ARBITRUM, true);
        bridge.setSupportedChain(DST_EID_ARBITRUM, true);
    }

    function test_setRegistry_onlyOwner() public {
        address newReg = makeAddr("newRegistry");
        bridge.setRegistry(newReg);
        assertEq(address(bridge.registry()), newReg);
    }

    function test_setRegistry_revertNonOwner() public {
        vm.prank(randomUser);
        vm.expectRevert();
        bridge.setRegistry(makeAddr("x"));
    }

    function test_setRegistry_revertZeroAddress() public {
        vm.expectRevert("zero registry");
        bridge.setRegistry(address(0));
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. bridgeOut()
    // ═══════════════════════════════════════════════════════════════════

    function _approveBridge(uint256 amount) internal {
        vm.prank(agentWallet);
        usdt0.approve(address(bridge), amount);
    }

    function test_bridgeOut_revertZeroAmount() public {
        _approveBridge(1000e6);
        vm.prank(agentWallet);
        vm.expectRevert(USDT0Bridge.ZeroAmount.selector);
        bridge.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, 0, 0);
    }

    function test_bridgeOut_revertChainNotSupported() public {
        uint32 unsupportedChain = 99999;
        _approveBridge(1000e6);
        vm.prank(agentWallet);
        vm.expectRevert(abi.encodeWithSelector(USDT0Bridge.ChainNotSupported.selector, unsupportedChain));
        bridge.bridgeOut(agentId, unsupportedChain, recipient, 1000e6, 900e6);
    }

    function test_bridgeOut_revertAgentNotRegistered() public {
        uint256 fakeAgentId = 999;
        _approveBridge(1000e6);
        vm.prank(agentWallet);
        vm.expectRevert(); // getAgent will revert for non-existent agent
        bridge.bridgeOut(fakeAgentId, DST_EID_ETHEREUM, recipient, 1000e6, 900e6);
    }

    function test_bridgeOut_revertNotAgentOwner() public {
        vm.prank(randomUser);
        vm.expectRevert(USDT0Bridge.NotAgentOwner.selector);
        bridge.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, 1000e6, 900e6);
    }

    function test_bridgeOut_successWithLzEndpoint() public {
        uint256 amount = 1000e6;
        _approveBridge(amount);

        vm.prank(agentWallet);
        uint256 nonce = bridge.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, amount, 900e6);

        assertEq(nonce, 0, "First nonce should be 0");
        assertEq(bridge.bridgeNonce(), 1, "Nonce should increment");
        assertEq(bridge.totalBridgedOut(), amount);
        assertEq(bridge.agentBridgedOut(agentId), amount);

        // Check the bridge request
        USDT0Bridge.BridgeRequest memory req = bridge.getBridgeRequest(nonce);
        assertEq(req.agentId, agentId);
        assertEq(req.dstEid, DST_EID_ETHEREUM);
        assertEq(req.amount, amount);
        assertEq(req.recipient, recipient);
        assertEq(uint8(req.status), uint8(USDT0Bridge.BridgeStatus.COMPLETED));
        assertEq(req.timestamp, block.timestamp);
    }

    function test_bridgeOut_emitsBridgeInitiated() public {
        uint256 amount = 500e6;
        _approveBridge(amount);

        vm.expectEmit(true, true, true, true);
        emit USDT0Bridge.BridgeInitiated(0, agentId, DST_EID_ETHEREUM, recipient, amount);

        vm.prank(agentWallet);
        bridge.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, amount, 450e6);
    }

    function test_bridgeOut_successWithoutLzEndpoint() public {
        // Deploy bridge with no LZ endpoint
        USDT0Bridge bridgeNoLz = new USDT0Bridge(address(usdt0), address(registry), address(0), protocolOwner);
        bridgeNoLz.setSupportedChain(DST_EID_ETHEREUM, true);

        uint256 amount = 1000e6;
        vm.prank(agentWallet);
        usdt0.approve(address(bridgeNoLz), amount);

        vm.prank(agentWallet);
        uint256 nonce = bridgeNoLz.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, amount, 900e6);

        // Should still complete (no LZ endpoint = manual bridging mode)
        USDT0Bridge.BridgeRequest memory req = bridgeNoLz.getBridgeRequest(nonce);
        assertEq(uint8(req.status), uint8(USDT0Bridge.BridgeStatus.COMPLETED));
        assertEq(bridgeNoLz.totalBridgedOut(), amount);

        // Tokens sit in the bridge contract (no LZ to forward them)
        assertEq(usdt0.balanceOf(address(bridgeNoLz)), amount);
    }

    function test_bridgeOut_lzCallFails_returnsFunds() public {
        // Deploy bridge with failing LZ endpoint
        USDT0Bridge bridgeFail =
            new USDT0Bridge(address(usdt0), address(registry), address(lzEndpointFail), protocolOwner);
        bridgeFail.setSupportedChain(DST_EID_ETHEREUM, true);

        uint256 amount = 1000e6;
        vm.prank(agentWallet);
        usdt0.approve(address(bridgeFail), amount);

        uint256 balanceBefore = usdt0.balanceOf(agentWallet);

        vm.prank(agentWallet);
        uint256 nonce = bridgeFail.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, amount, 900e6);

        // Funds should be returned
        assertEq(usdt0.balanceOf(agentWallet), balanceBefore, "Funds should be returned on LZ failure");

        // Stats should be rolled back
        assertEq(bridgeFail.totalBridgedOut(), 0, "Stats should be rolled back");
        assertEq(bridgeFail.agentBridgedOut(agentId), 0, "Agent stats should be rolled back");

        // Request should be marked FAILED
        USDT0Bridge.BridgeRequest memory req = bridgeFail.getBridgeRequest(nonce);
        assertEq(uint8(req.status), uint8(USDT0Bridge.BridgeStatus.FAILED));
    }

    function test_bridgeOut_lzCallFails_emitsBridgeFailed() public {
        USDT0Bridge bridgeFail =
            new USDT0Bridge(address(usdt0), address(registry), address(lzEndpointFail), protocolOwner);
        bridgeFail.setSupportedChain(DST_EID_ETHEREUM, true);

        uint256 amount = 500e6;
        vm.prank(agentWallet);
        usdt0.approve(address(bridgeFail), amount);

        vm.expectEmit(true, true, false, true);
        emit USDT0Bridge.BridgeFailed(0, agentId, amount);

        vm.prank(agentWallet);
        bridgeFail.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, amount, 450e6);
    }

    function test_bridgeOut_multipleBridges_incrementNonce() public {
        uint256 amount = 100e6;

        // First bridge
        _approveBridge(amount);
        vm.prank(agentWallet);
        uint256 nonce1 = bridge.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, amount, 90e6);

        // Second bridge
        _approveBridge(amount);
        vm.prank(agentWallet);
        uint256 nonce2 = bridge.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, amount, 90e6);

        assertEq(nonce1, 0);
        assertEq(nonce2, 1);
        assertEq(bridge.bridgeNonce(), 2);
        assertEq(bridge.totalBridgedOut(), 200e6);
        assertEq(bridge.agentBridgedOut(agentId), 200e6);
    }

    function test_bridgeOut_veryLargeAmount() public {
        uint256 largeAmount = 1_000_000_000e6; // 1 billion USDT0
        usdt0.mint(agentWallet, largeAmount);

        vm.prank(agentWallet);
        usdt0.approve(address(bridge), largeAmount);

        vm.prank(agentWallet);
        uint256 nonce = bridge.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, largeAmount, largeAmount);

        assertEq(bridge.totalBridgedOut(), largeAmount);

        USDT0Bridge.BridgeRequest memory req = bridge.getBridgeRequest(nonce);
        assertEq(req.amount, largeAmount);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. routeBridgedRevenue()
    // ═══════════════════════════════════════════════════════════════════

    function test_routeBridgedRevenue_success() public {
        uint256 amount = 5000e6;
        // Send USDT0 directly to the bridge (simulating bridged-in tokens)
        usdt0.mint(address(bridge), amount);

        bridge.routeBridgedRevenue(agentId, amount);

        assertEq(usdt0.balanceOf(lockboxAddr), amount, "Lockbox should receive funds");
        assertEq(bridge.totalBridgedIn(), amount);
        assertEq(bridge.agentBridgedIn(agentId), amount);
    }

    function test_routeBridgedRevenue_emitsEvent() public {
        uint256 amount = 2000e6;
        usdt0.mint(address(bridge), amount);

        vm.expectEmit(true, true, false, true);
        emit USDT0Bridge.RevenueReceivedFromBridge(agentId, lockboxAddr, amount);

        bridge.routeBridgedRevenue(agentId, amount);
    }

    function test_routeBridgedRevenue_revertZeroAmount() public {
        vm.expectRevert(USDT0Bridge.ZeroAmount.selector);
        bridge.routeBridgedRevenue(agentId, 0);
    }

    function test_routeBridgedRevenue_revertAgentNotRegistered() public {
        uint256 fakeAgentId = 999;
        usdt0.mint(address(bridge), 1000e6);
        vm.expectRevert(); // getAgent reverts for non-existent agent
        bridge.routeBridgedRevenue(fakeAgentId, 1000e6);
    }

    function test_routeBridgedRevenue_revertNoLockbox() public {
        // Register agent without vault/lockbox (no asset)
        address agentWallet2 = makeAddr("agentWallet2");
        uint256 newAgentId =
            registry.registerAgent(agentWallet2, keccak256("code2"), "Agent2", address(0), 0, bytes32(0), address(0));

        usdt0.mint(address(bridge), 1000e6);

        vm.expectRevert(USDT0Bridge.NoLockbox.selector);
        bridge.routeBridgedRevenue(newAgentId, 1000e6);
    }

    function test_routeBridgedRevenue_revertInsufficientBalance() public {
        // Bridge has 0 USDT0 balance
        vm.expectRevert(USDT0Bridge.InsufficientBalance.selector);
        bridge.routeBridgedRevenue(agentId, 1000e6);
    }

    function test_routeBridgedRevenue_partialBalance() public {
        // Bridge has some but not enough
        usdt0.mint(address(bridge), 500e6);

        vm.expectRevert(USDT0Bridge.InsufficientBalance.selector);
        bridge.routeBridgedRevenue(agentId, 1000e6);
    }

    function test_routeBridgedRevenue_callableByAnyone() public {
        uint256 amount = 1000e6;
        usdt0.mint(address(bridge), amount);

        // Random user can route bridged revenue
        vm.prank(randomUser);
        bridge.routeBridgedRevenue(agentId, amount);

        assertEq(usdt0.balanceOf(lockboxAddr), amount);
    }

    function test_routeBridgedRevenue_multipleRoutes() public {
        usdt0.mint(address(bridge), 3000e6);

        bridge.routeBridgedRevenue(agentId, 1000e6);
        bridge.routeBridgedRevenue(agentId, 2000e6);

        assertEq(bridge.totalBridgedIn(), 3000e6);
        assertEq(bridge.agentBridgedIn(agentId), 3000e6);
        assertEq(usdt0.balanceOf(lockboxAddr), 3000e6);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. estimateBridgeFee()
    // ═══════════════════════════════════════════════════════════════════

    function test_estimateBridgeFee_returnsZeroNoEndpoint() public {
        USDT0Bridge bridgeNoLz = new USDT0Bridge(address(usdt0), address(registry), address(0), protocolOwner);

        (uint256 fee, bool available) = bridgeNoLz.estimateBridgeFee(DST_EID_ETHEREUM, 1000e6);
        assertEq(fee, 0);
        assertFalse(available, "Should not be available without endpoint");
    }

    function test_estimateBridgeFee_returnsQuote() public view {
        (uint256 fee, bool available) = bridge.estimateBridgeFee(DST_EID_ETHEREUM, 1000e6);
        assertEq(fee, 0.01 ether, "Should return mock endpoint quote");
        assertTrue(available, "Should be available with working endpoint");
    }

    function test_estimateBridgeFee_handlesEndpointFailure() public {
        MockLzEndpointQuoteFail failQuote = new MockLzEndpointQuoteFail();
        USDT0Bridge bridgeFailQuote =
            new USDT0Bridge(address(usdt0), address(registry), address(failQuote), protocolOwner);

        // Should return 0 gracefully when quoteSend reverts
        (uint256 fee, bool available) = bridgeFailQuote.estimateBridgeFee(DST_EID_ETHEREUM, 1000e6);
        assertEq(fee, 0, "Should return 0 on quote failure");
        assertFalse(available, "Should not be available on quote failure");
    }

    // ═══════════════════════════════════════════════════════════════════
    // 5. Access Control
    // ═══════════════════════════════════════════════════════════════════

    function test_onlyOwner_setSupportedChain() public {
        vm.prank(agentWallet);
        vm.expectRevert();
        bridge.setSupportedChain(DST_EID_ARBITRUM, true);
    }

    function test_onlyOwner_setLzEndpoint() public {
        vm.prank(agentWallet);
        vm.expectRevert();
        bridge.setLzEndpoint(makeAddr("x"));
    }

    function test_onlyOwner_setRegistry() public {
        vm.prank(agentWallet);
        vm.expectRevert();
        bridge.setRegistry(makeAddr("x"));
    }

    function test_onlyOwner_rescueToken() public {
        vm.prank(agentWallet);
        vm.expectRevert();
        bridge.rescueToken(address(otherToken), agentWallet, 100);
    }

    function test_onlyOwner_rescueETH() public {
        vm.prank(agentWallet);
        vm.expectRevert();
        bridge.rescueETH(payable(agentWallet));
    }

    function test_bridgeOut_agentOwnership_strictCheck() public {
        // Register a second agent
        address agentWallet2 = makeAddr("agentWallet2");
        uint256 agentId2 = registry.registerAgent(
            agentWallet2, keccak256("code2"), "Agent2", address(0), 0, bytes32(0), address(usdt0)
        );

        // Agent1 wallet tries to bridge for Agent2 - should fail
        _approveBridge(1000e6);
        vm.prank(agentWallet);
        vm.expectRevert(USDT0Bridge.NotAgentOwner.selector);
        bridge.bridgeOut(agentId2, DST_EID_ETHEREUM, recipient, 1000e6, 900e6);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 6. Rescue Functions
    // ═══════════════════════════════════════════════════════════════════

    function test_rescueToken_success() public {
        uint256 amount = 500e18;
        otherToken.mint(address(bridge), amount);

        address rescueTo = makeAddr("rescueTo");
        bridge.rescueToken(address(otherToken), rescueTo, amount);

        assertEq(otherToken.balanceOf(rescueTo), amount);
        assertEq(otherToken.balanceOf(address(bridge)), 0);
    }

    function test_rescueToken_revertCannotRescueUSDT0() public {
        usdt0.mint(address(bridge), 1000e6);

        vm.expectRevert("cannot rescue USDT0 directly");
        bridge.rescueToken(address(usdt0), protocolOwner, 1000e6);
    }

    function test_rescueETH_success() public {
        // Send ETH to the bridge
        vm.deal(address(bridge), 2 ether);

        address payable rescueTo = payable(makeAddr("rescueETHTo"));
        bridge.rescueETH(rescueTo);

        assertEq(rescueTo.balance, 2 ether);
        assertEq(address(bridge).balance, 0);
    }

    function test_rescueETH_revertNoETH() public {
        vm.expectRevert("no ETH");
        bridge.rescueETH(payable(protocolOwner));
    }

    function test_receiveETH() public {
        vm.deal(protocolOwner, 1 ether);
        (bool success,) = address(bridge).call{value: 1 ether}("");
        assertTrue(success, "Bridge should accept ETH");
        assertEq(address(bridge).balance, 1 ether);
    }

    // ═══════════════════════════════════════════════════════════════════
    // 7. View Functions
    // ═══════════════════════════════════════════════════════════════════

    function test_getBridgeRequest_returnsCorrectData() public {
        uint256 amount = 750e6;
        _approveBridge(amount);

        vm.prank(agentWallet);
        uint256 nonce = bridge.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, amount, 700e6);

        USDT0Bridge.BridgeRequest memory req = bridge.getBridgeRequest(nonce);
        assertEq(req.agentId, agentId);
        assertEq(req.dstEid, DST_EID_ETHEREUM);
        assertEq(req.amount, amount);
        assertEq(req.recipient, recipient);
    }

    function test_getAgentBridgeStats() public {
        // Bridge out
        uint256 outAmount = 500e6;
        _approveBridge(outAmount);
        vm.prank(agentWallet);
        bridge.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, outAmount, 450e6);

        // Bridge in (send tokens to bridge, then route)
        uint256 inAmount = 300e6;
        usdt0.mint(address(bridge), inAmount);
        bridge.routeBridgedRevenue(agentId, inAmount);

        (uint256 bridgedOut, uint256 bridgedIn) = bridge.getAgentBridgeStats(agentId);
        assertEq(bridgedOut, outAmount);
        assertEq(bridgedIn, inAmount);
    }

    function test_getBridgeRequest_nonExistentNonce() public view {
        // Should return zeroed-out struct for non-existent nonce
        USDT0Bridge.BridgeRequest memory req = bridge.getBridgeRequest(12345);
        assertEq(req.agentId, 0);
        assertEq(req.amount, 0);
        assertEq(req.recipient, address(0));
    }

    // ═══════════════════════════════════════════════════════════════════
    // 8. Edge Cases
    // ═══════════════════════════════════════════════════════════════════

    function test_bridgeOut_withMsgValue() public {
        uint256 amount = 1000e6;
        _approveBridge(amount);

        vm.deal(agentWallet, 1 ether);
        vm.prank(agentWallet);
        bridge.bridgeOut{value: 0.1 ether}(agentId, DST_EID_ETHEREUM, recipient, amount, 900e6);

        // LZ endpoint should have received the ETH
        assertEq(address(lzEndpoint).balance, 0.1 ether);
    }

    function test_bridgeOut_consecutiveNoncesAfterFailure() public {
        // First bridge with failing endpoint
        USDT0Bridge bridgeFail =
            new USDT0Bridge(address(usdt0), address(registry), address(lzEndpointFail), protocolOwner);
        bridgeFail.setSupportedChain(DST_EID_ETHEREUM, true);

        uint256 amount = 100e6;

        // First bridge fails
        vm.prank(agentWallet);
        usdt0.approve(address(bridgeFail), amount);
        vm.prank(agentWallet);
        uint256 nonce1 = bridgeFail.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, amount, 90e6);

        // Second bridge also fails
        vm.prank(agentWallet);
        usdt0.approve(address(bridgeFail), amount);
        vm.prank(agentWallet);
        uint256 nonce2 = bridgeFail.bridgeOut(agentId, DST_EID_ETHEREUM, recipient, amount, 90e6);

        // Nonces still increment even on failure
        assertEq(nonce1, 0);
        assertEq(nonce2, 1);
        assertEq(bridgeFail.bridgeNonce(), 2);

        // But stats should be 0 since both failed
        assertEq(bridgeFail.totalBridgedOut(), 0);
    }

    function test_supportedChains_defaultFalse() public view {
        assertFalse(bridge.supportedChains(99999));
        assertFalse(bridge.supportedChains(0));
    }

    function test_bridgeOut_disabledChainAfterEnable() public {
        bridge.setSupportedChain(DST_EID_ARBITRUM, true);
        assertTrue(bridge.supportedChains(DST_EID_ARBITRUM));

        bridge.setSupportedChain(DST_EID_ARBITRUM, false);
        assertFalse(bridge.supportedChains(DST_EID_ARBITRUM));

        _approveBridge(100e6);
        vm.prank(agentWallet);
        vm.expectRevert(abi.encodeWithSelector(USDT0Bridge.ChainNotSupported.selector, DST_EID_ARBITRUM));
        bridge.bridgeOut(agentId, DST_EID_ARBITRUM, recipient, 100e6, 90e6);
    }
}
