// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {LenclawToken} from "../src/governance/LenclawToken.sol";
import {LenclawGovernor} from "../src/governance/LenclawGovernor.sol";
import {LenclawTimelock} from "../src/governance/LenclawTimelock.sol";
import {GovernableParams} from "../src/governance/GovernableParams.sol";

/// @dev Concrete implementation of GovernableParams for testing
contract MockGovernableParams is GovernableParams {
    constructor(address _governance)
        GovernableParams(
            _governance,
            1000, // 10% protocol fee
            7 days, // 7 day withdrawal cooldown
            9000, // 90% max utilization
            300 // min credit score 300
        )
    {}
}

contract GovernanceTest is Test {
    LenclawToken token;
    LenclawGovernor governor;
    LenclawTimelock timelock;
    MockGovernableParams params;

    address deployer = makeAddr("deployer");
    address voter1 = makeAddr("voter1");
    address voter2 = makeAddr("voter2");
    address voter3 = makeAddr("voter3");

    uint256 constant INITIAL_SUPPLY = 10_000_000e18; // 10M tokens
    uint256 constant VOTER1_AMOUNT = 5_000_000e18; // 5M tokens
    uint256 constant VOTER2_AMOUNT = 3_000_000e18; // 3M tokens
    uint256 constant VOTER3_AMOUNT = 2_000_000e18; // 2M tokens

    function setUp() public {
        vm.startPrank(deployer);

        // 1. Deploy token
        token = new LenclawToken(deployer);

        // 2. Deploy timelock with empty proposers/executors (will be set after governor deploy)
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0); // anyone can execute
        timelock = new LenclawTimelock(proposers, executors, deployer);

        // 3. Deploy governor
        governor = new LenclawGovernor(token, timelock);

        // 4. Grant proposer/canceller roles to the governor on the timelock
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));

        // 5. Renounce admin role so only governance controls the timelock
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), deployer);

        // 6. Mint tokens to voters
        token.mint(voter1, VOTER1_AMOUNT);
        token.mint(voter2, VOTER2_AMOUNT);
        token.mint(voter3, VOTER3_AMOUNT);

        vm.stopPrank();

        // 7. Voters delegate to themselves to activate voting power
        vm.prank(voter1);
        token.delegate(voter1);

        vm.prank(voter2);
        token.delegate(voter2);

        vm.prank(voter3);
        token.delegate(voter3);

        // 8. Deploy governed params with timelock as governance
        params = new MockGovernableParams(address(timelock));

        // Advance timestamp so voting checkpoints have past data
        vm.warp(block.timestamp + 1);
    }

    // ===================== Token Tests =====================

    function test_tokenName() public view {
        assertEq(token.name(), "Lenclaw");
        assertEq(token.symbol(), "LNCL");
    }

    function test_tokenMaxSupply() public view {
        assertEq(token.MAX_SUPPLY(), 100_000_000e18);
    }

    function test_tokenMintOnlyOwner() public {
        vm.prank(voter1);
        vm.expectRevert();
        token.mint(voter1, 1e18);
    }

    function test_tokenMintExceedsMaxSupply() public {
        vm.startPrank(deployer);
        // Already minted 10M, try to mint 91M more (would exceed 100M cap)
        vm.expectRevert(
            abi.encodeWithSelector(LenclawToken.MaxSupplyExceeded.selector, 91_000_000e18, 90_000_000e18)
        );
        token.mint(deployer, 91_000_000e18);
        vm.stopPrank();
    }

    function test_tokenClockMode() public view {
        assertEq(token.CLOCK_MODE(), "mode=timestamp");
    }

    function test_tokenDelegation() public view {
        assertEq(token.getVotes(voter1), VOTER1_AMOUNT);
        assertEq(token.getVotes(voter2), VOTER2_AMOUNT);
        assertEq(token.getVotes(voter3), VOTER3_AMOUNT);
    }

    // ===================== Timelock Tests =====================

    function test_timelockMinDelay() public view {
        assertEq(timelock.getMinDelay(), 2 days);
    }

    function test_timelockConstant() public view {
        assertEq(timelock.MIN_DELAY(), 2 days);
    }

    // ===================== Governor Tests =====================

    function test_governorSettings() public view {
        assertEq(governor.votingDelay(), 1 days);
        assertEq(governor.votingPeriod(), 1 weeks);
        assertEq(governor.proposalThreshold(), 100_000e18);
        assertEq(governor.quorum(block.timestamp - 1), (INITIAL_SUPPLY * 4) / 100); // 4% of total supply
    }

    function test_governorName() public view {
        assertEq(governor.name(), "LenclawGovernor");
    }

    // ===================== GovernableParams Tests =====================

    function test_paramsInitialValues() public view {
        assertEq(params.protocolFeeBps(), 1000);
        assertEq(params.withdrawalCooldownPeriod(), 7 days);
        assertEq(params.maxUtilizationBps(), 9000);
        assertEq(params.minCreditScore(), 300);
        assertEq(params.governance(), address(timelock));
    }

    function test_paramsOnlyGovernance() public {
        vm.prank(voter1);
        vm.expectRevert(abi.encodeWithSelector(GovernableParams.NotGovernance.selector, voter1));
        params.setProtocolFeeBps(500);
    }

    function test_paramsInvalidFeeBps() public {
        vm.prank(address(timelock));
        vm.expectRevert(abi.encodeWithSelector(GovernableParams.InvalidFeeBps.selector, 5000));
        params.setProtocolFeeBps(5000);
    }

    function test_paramsInvalidUtilization() public {
        vm.prank(address(timelock));
        vm.expectRevert(abi.encodeWithSelector(GovernableParams.InvalidUtilizationBps.selector, 10_001));
        params.setMaxUtilizationBps(10_001);
    }

    function test_paramsInvalidCreditScore() public {
        vm.prank(address(timelock));
        vm.expectRevert(abi.encodeWithSelector(GovernableParams.InvalidCreditScore.selector, 1001));
        params.setMinCreditScore(1001);
    }

    function test_paramsDirectGovernanceSet() public {
        vm.prank(address(timelock));
        params.setProtocolFeeBps(500);
        assertEq(params.protocolFeeBps(), 500);
    }

    function test_paramsSetWithdrawalCooldown() public {
        vm.prank(address(timelock));
        params.setWithdrawalCooldownPeriod(14 days);
        assertEq(params.withdrawalCooldownPeriod(), 14 days);
    }

    function test_paramsSetMaxUtilization() public {
        vm.prank(address(timelock));
        params.setMaxUtilizationBps(8000);
        assertEq(params.maxUtilizationBps(), 8000);
    }

    function test_paramsSetMinCreditScore() public {
        vm.prank(address(timelock));
        params.setMinCreditScore(500);
        assertEq(params.minCreditScore(), 500);
    }

    function test_paramsTransferGovernance() public {
        address newGov = makeAddr("newGov");
        vm.prank(address(timelock));
        params.setGovernance(newGov);
        assertEq(params.governance(), newGov);
    }

    function test_paramsTransferGovernanceZeroAddress() public {
        vm.prank(address(timelock));
        vm.expectRevert(GovernableParams.ZeroAddress.selector);
        params.setGovernance(address(0));
    }

    // ===================== Full Governance Lifecycle =====================

    function test_governanceLifecycle_proposeVoteQueueExecute() public {
        // --- Prepare the proposal: change protocolFeeBps to 500 via governance ---
        address[] memory targets = new address[](1);
        targets[0] = address(params);

        uint256[] memory values = new uint256[](1);
        values[0] = 0;

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeCall(GovernableParams.setProtocolFeeBps, (500));

        string memory description = "Reduce protocol fee to 5%";

        // --- Propose (voter1 has enough tokens to meet threshold) ---
        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);
        assertGt(proposalId, 0, "Proposal ID should be non-zero");

        // Check state: Pending
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Pending));

        // --- Advance past voting delay (1 day) ---
        vm.warp(block.timestamp + 1 days + 1);

        // Check state: Active
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Active));

        // --- Vote (all three voters vote For) ---
        vm.prank(voter1);
        governor.castVote(proposalId, 1); // 1 = For

        vm.prank(voter2);
        governor.castVote(proposalId, 1);

        vm.prank(voter3);
        governor.castVote(proposalId, 1);

        // Verify vote counts
        (uint256 againstVotes, uint256 forVotes, uint256 abstainVotes) = governor.proposalVotes(proposalId);
        assertEq(forVotes, VOTER1_AMOUNT + VOTER2_AMOUNT + VOTER3_AMOUNT);
        assertEq(againstVotes, 0);
        assertEq(abstainVotes, 0);

        // --- Advance past voting period (1 week) ---
        vm.warp(block.timestamp + 1 weeks + 1);

        // Check state: Succeeded
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Succeeded));

        // --- Queue the proposal in the timelock ---
        bytes32 descriptionHash = keccak256(bytes(description));
        governor.queue(targets, values, calldatas, descriptionHash);

        // Check state: Queued
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Queued));

        // --- Advance past timelock delay (2 days) ---
        vm.warp(block.timestamp + 2 days + 1);

        // --- Execute the proposal ---
        governor.execute(targets, values, calldatas, descriptionHash);

        // Check state: Executed
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Executed));

        // --- Verify the parameter was changed ---
        assertEq(params.protocolFeeBps(), 500, "Protocol fee should now be 500 bps (5%)");
    }

    function test_governanceLifecycle_proposalDefeated() public {
        // --- Propose: change max utilization to 50% ---
        address[] memory targets = new address[](1);
        targets[0] = address(params);

        uint256[] memory values = new uint256[](1);
        values[0] = 0;

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeCall(GovernableParams.setMaxUtilizationBps, (5000));

        string memory description = "Reduce max utilization to 50%";

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        // Advance past voting delay
        vm.warp(block.timestamp + 1 days + 1);

        // voter1 votes For (5M), voter2 and voter3 vote Against (5M)
        vm.prank(voter1);
        governor.castVote(proposalId, 1); // For

        vm.prank(voter2);
        governor.castVote(proposalId, 0); // Against

        vm.prank(voter3);
        governor.castVote(proposalId, 0); // Against

        // Advance past voting period
        vm.warp(block.timestamp + 1 weeks + 1);

        // Check state: Defeated (more against than for)
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Defeated));

        // Parameter should remain unchanged
        assertEq(params.maxUtilizationBps(), 9000, "Max utilization should be unchanged");
    }

    function test_governanceLifecycle_multipleParamChanges() public {
        // --- Batch proposal: change two parameters in one proposal ---
        address[] memory targets = new address[](2);
        targets[0] = address(params);
        targets[1] = address(params);

        uint256[] memory values = new uint256[](2);
        values[0] = 0;
        values[1] = 0;

        bytes[] memory calldatas = new bytes[](2);
        calldatas[0] = abi.encodeCall(GovernableParams.setProtocolFeeBps, (750));
        calldatas[1] = abi.encodeCall(GovernableParams.setMinCreditScore, (400));

        string memory description = "Update protocol fee and min credit score";

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        // Advance past voting delay
        vm.warp(block.timestamp + 1 days + 1);

        // All voters vote For
        vm.prank(voter1);
        governor.castVote(proposalId, 1);
        vm.prank(voter2);
        governor.castVote(proposalId, 1);

        // Advance past voting period
        vm.warp(block.timestamp + 1 weeks + 1);

        // Queue and execute
        bytes32 descriptionHash = keccak256(bytes(description));
        governor.queue(targets, values, calldatas, descriptionHash);

        vm.warp(block.timestamp + 2 days + 1);
        governor.execute(targets, values, calldatas, descriptionHash);

        // Both parameters should be updated
        assertEq(params.protocolFeeBps(), 750, "Protocol fee should be 750 bps");
        assertEq(params.minCreditScore(), 400, "Min credit score should be 400");
    }

    function test_proposalThresholdEnforced() public {
        // Give voter3 exactly the threshold amount minus 1
        address lowHolder = makeAddr("lowHolder");
        vm.prank(deployer);
        token.mint(lowHolder, 99_999e18); // Just under 100k threshold

        vm.prank(lowHolder);
        token.delegate(lowHolder);

        vm.warp(block.timestamp + 1);

        address[] memory targets = new address[](1);
        targets[0] = address(params);

        uint256[] memory values = new uint256[](1);
        values[0] = 0;

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeCall(GovernableParams.setProtocolFeeBps, (200));

        // Should revert because lowHolder doesn't meet proposal threshold
        vm.prank(lowHolder);
        vm.expectRevert();
        governor.propose(targets, values, calldatas, "Should fail");
    }

    function test_cannotExecuteBeforeTimelockDelay() public {
        // Propose and vote
        address[] memory targets = new address[](1);
        targets[0] = address(params);

        uint256[] memory values = new uint256[](1);
        values[0] = 0;

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeCall(GovernableParams.setProtocolFeeBps, (500));

        string memory description = "Reduce fee";

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        vm.warp(block.timestamp + 1 days + 1);

        vm.prank(voter1);
        governor.castVote(proposalId, 1);
        vm.prank(voter2);
        governor.castVote(proposalId, 1);

        vm.warp(block.timestamp + 1 weeks + 1);

        bytes32 descriptionHash = keccak256(bytes(description));
        governor.queue(targets, values, calldatas, descriptionHash);

        // Try to execute immediately (before 2 day delay) - should revert
        vm.expectRevert();
        governor.execute(targets, values, calldatas, descriptionHash);

        // Verify param unchanged
        assertEq(params.protocolFeeBps(), 1000, "Fee should be unchanged before execution");
    }
}
