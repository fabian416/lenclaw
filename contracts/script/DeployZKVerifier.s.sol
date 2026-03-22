// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ZKCreditVerifier} from "../src/ZKCreditVerifier.sol";
import {CreditScorer} from "../src/CreditScorer.sol";
import {AgentCreditLine} from "../src/AgentCreditLine.sol";

/// @title DeployZKVerifier - Deploy and wire ZKCreditVerifier to existing protocol
contract DeployZKVerifier is Script {
    // Deployed contract addresses on Base mainnet
    address constant AGENT_REGISTRY = 0x9B2A14A423067BAdd5a64979E59dED6C7A5681Ea;
    address constant CREDIT_SCORER = 0xeB2189bC09f65085B8cb8d50275326B3433b7B5d;
    address constant AGENT_CREDIT_LINE = 0xdbb95d8aF780D73e441e922f3b9642a5C116629c;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console.log("Deploying ZKCreditVerifier to Base mainnet");
        console.log("Deployer:", deployer);

        vm.startBroadcast(deployerKey);

        // 1. Deploy ZKCreditVerifier (verifierKeyHash can be updated later)
        bytes32 initialKeyHash = keccak256("lenclaw-credit-proof-v1");
        ZKCreditVerifier verifier = new ZKCreditVerifier(AGENT_REGISTRY, deployer, initialKeyHash);
        console.log("ZKCreditVerifier:", address(verifier));

        // 2. Wire to CreditScorer (optional ZK boost)
        CreditScorer scorer = CreditScorer(CREDIT_SCORER);
        scorer.setZKVerifier(address(verifier));
        console.log("CreditScorer.zkVerifier set");

        // 3. Wire to AgentCreditLine (optional ZK gate)
        AgentCreditLine creditLine = AgentCreditLine(AGENT_CREDIT_LINE);
        creditLine.setZKVerifier(address(verifier));
        console.log("AgentCreditLine.zkVerifier set");
        // NOTE: requireZKProof remains false by default — agents can borrow without ZK proof

        vm.stopBroadcast();

        console.log("--- ZK Verifier deployment complete ---");
    }
}
