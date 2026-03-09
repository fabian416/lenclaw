// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {AgentRegistry} from "../src/AgentRegistry.sol";
import {IAgentRegistry} from "../src/interfaces/IAgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry public registry;
    address public owner = address(this);
    address public agent1 = makeAddr("agent1");
    address public agent2 = makeAddr("agent2");
    address public nonOwner = makeAddr("nonOwner");

    bytes32 public codeHash1 = keccak256("agent1-code-v1");
    bytes32 public codeHash2 = keccak256("agent2-code-v1");

    function setUp() public {
        registry = new AgentRegistry(owner);
    }

    // ── registerAgent ───────────────────────────────────────────

    function test_registerAgent_success() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1 metadata", address(0), 0, bytes32(0), address(0));

        assertEq(agentId, 1);
        assertEq(registry.ownerOf(agentId), agent1);
        assertEq(registry.totalAgents(), 1);
    }

    function test_registerAgent_setsCorrectProfile() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1 metadata", address(0), 0, bytes32(0), address(0));

        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        assertEq(profile.wallet, agent1);
        assertEq(profile.codeHash, codeHash1);
        assertEq(profile.metadata, "Agent 1 metadata");
        assertEq(profile.reputationScore, 500); // default starting score
        assertFalse(profile.codeVerified);
        assertEq(profile.lockbox, address(0));
        assertGt(profile.registeredAt, 0);
    }

    function test_registerAgent_incrementsIds() public {
        uint256 id1 = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));
        uint256 id2 = registry.registerAgent(agent2, codeHash2, "Agent 2", address(0), 0, bytes32(0), address(0));

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(registry.totalAgents(), 2);
    }

    function test_registerAgent_emitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit IAgentRegistry.AgentRegistered(1, agent1, codeHash1);

        registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));
    }

    function test_registerAgent_revertsOnZeroAddress() public {
        vm.expectRevert("AgentRegistry: zero address");
        registry.registerAgent(address(0), codeHash1, "", address(0), 0, bytes32(0), address(0));
    }

    function test_registerAgent_revertsOnDuplicateWallet() public {
        registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));

        vm.expectRevert("AgentRegistry: already registered");
        registry.registerAgent(agent1, codeHash2, "Agent 1 again", address(0), 0, bytes32(0), address(0));
    }

    // ── updateReputation ────────────────────────────────────────

    function test_updateReputation_success() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));

        registry.updateReputation(agentId, 800);

        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        assertEq(profile.reputationScore, 800);
    }

    function test_updateReputation_emitsEvent() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));

        vm.expectEmit(true, false, false, true);
        emit IAgentRegistry.ReputationUpdated(agentId, 500, 800);

        registry.updateReputation(agentId, 800);
    }

    function test_updateReputation_revertsForNonProtocol() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));

        vm.prank(nonOwner);
        vm.expectRevert("AgentRegistry: not protocol");
        registry.updateReputation(agentId, 800);
    }

    function test_updateReputation_revertsForNonExistentAgent() public {
        vm.expectRevert("AgentRegistry: agent not found");
        registry.updateReputation(999, 500);
    }

    function test_updateReputation_revertsForScoreAbove1000() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));

        vm.expectRevert("AgentRegistry: score out of range");
        registry.updateReputation(agentId, 1001);
    }

    function test_updateReputation_allowsExactly1000() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));

        registry.updateReputation(agentId, 1000);
        assertEq(registry.getAgent(agentId).reputationScore, 1000);
    }

    function test_updateReputation_allowsZero() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));

        registry.updateReputation(agentId, 0);
        assertEq(registry.getAgent(agentId).reputationScore, 0);
    }

    // ── verifyCode ──────────────────────────────────────────────

    function test_verifyCode_success() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));
        bytes32 newHash = keccak256("agent1-code-v2");
        bytes memory attestation = "tee-attestation-data";

        registry.verifyCode(agentId, newHash, attestation);

        IAgentRegistry.AgentProfile memory profile = registry.getAgent(agentId);
        assertEq(profile.codeHash, newHash);
        assertTrue(profile.codeVerified);
    }

    function test_verifyCode_emitsEvent() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));
        bytes32 newHash = keccak256("agent1-code-v2");

        vm.expectEmit(true, false, false, true);
        emit IAgentRegistry.CodeVerified(agentId, newHash);

        registry.verifyCode(agentId, newHash, "attestation");
    }

    function test_verifyCode_revertsOnEmptyAttestation() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));

        vm.expectRevert("AgentRegistry: empty attestation");
        registry.verifyCode(agentId, codeHash1, "");
    }

    function test_verifyCode_revertsForNonProtocol() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));

        vm.prank(nonOwner);
        vm.expectRevert("AgentRegistry: not protocol");
        registry.verifyCode(agentId, codeHash1, "attestation");
    }

    // ── setLockbox ──────────────────────────────────────────────

    function test_setLockbox_success() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));
        address lockbox = makeAddr("lockbox");

        registry.setLockbox(agentId, lockbox);

        assertEq(registry.getAgent(agentId).lockbox, lockbox);
    }

    function test_setLockbox_revertsOnZeroAddress() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));

        vm.expectRevert("AgentRegistry: zero lockbox");
        registry.setLockbox(agentId, address(0));
    }

    // ── getAgentIdByWallet ──────────────────────────────────────

    function test_getAgentIdByWallet_success() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));

        assertEq(registry.getAgentIdByWallet(agent1), agentId);
    }

    function test_getAgentIdByWallet_revertsForUnregistered() public {
        vm.expectRevert("AgentRegistry: wallet not registered");
        registry.getAgentIdByWallet(makeAddr("unknown"));
    }

    // ── isRegistered ────────────────────────────────────────────

    function test_isRegistered_returnsTrueForExisting() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));
        assertTrue(registry.isRegistered(agentId));
    }

    function test_isRegistered_returnsFalseForNonExistent() public {
        assertFalse(registry.isRegistered(999));
    }

    // ── setProtocol ─────────────────────────────────────────────

    function test_setProtocol_onlyOwner() public {
        address newProtocol = makeAddr("newProtocol");

        vm.prank(nonOwner);
        vm.expectRevert();
        registry.setProtocol(newProtocol);
    }

    function test_setProtocol_allowsNewProtocolToUpdateReputation() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));
        address newProtocol = makeAddr("newProtocol");

        registry.setProtocol(newProtocol);

        vm.prank(newProtocol);
        registry.updateReputation(agentId, 900);
        assertEq(registry.getAgent(agentId).reputationScore, 900);
    }

    // ── ERC-721 ─────────────────────────────────────────────────

    function test_mintsNFTToAgent() public {
        uint256 agentId = registry.registerAgent(agent1, codeHash1, "Agent 1", address(0), 0, bytes32(0), address(0));

        assertEq(registry.ownerOf(agentId), agent1);
        assertEq(registry.balanceOf(agent1), 1);
    }

    function test_tokenNameAndSymbol() public view {
        assertEq(registry.name(), "Lenclaw Agent");
        assertEq(registry.symbol(), "lcAGENT");
    }
}
