// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ITEEAttestationVerifier} from "./ITEEAttestationVerifier.sol";

/// @title TEEAttestationVerifier
/// @notice On-chain verifier that stores TEE attestation results per agent and
///         integrates with the Lenclaw AgentRegistry to update code-verification
///         status.
///
/// @dev Architecture:
///   1. An off-chain attestation service verifies a TEE quote (Intel SGX or
///      AWS Nitro) and extracts the code measurement.
///   2. The authorised `attestor` address calls `submitAttestation` to record
///      the result on-chain.
///   3. The contract optionally calls `AgentRegistry.verifyCode` so that the
///      agent's `codeVerified` flag is set in one transaction.
///   4. Anyone can query `isAttestationValid` to check whether an agent has a
///      current, non-expired attestation.
contract TEEAttestationVerifier is Ownable, ITEEAttestationVerifier {
    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    /// @notice Address permitted to submit attestation results.
    address public override attestor;

    /// @notice Reference to the AgentRegistry (optional — zero disables integration).
    address public agentRegistry;

    /// @notice Default TTL applied when the caller passes `expiresAt == 0`.
    uint256 public defaultTTL = 86_400; // 24 hours

    /// @notice agentId => AttestationRecord
    mapping(uint256 => AttestationRecord) private _records;

    // -----------------------------------------------------------------------
    // Modifiers
    // -----------------------------------------------------------------------

    modifier onlyAttestor() {
        require(msg.sender == attestor, "TEEVerifier: caller is not attestor");
        _;
    }

    modifier onlyAttestorOrOwner() {
        require(
            msg.sender == attestor || msg.sender == owner(),
            "TEEVerifier: caller is not attestor or owner"
        );
        _;
    }

    // -----------------------------------------------------------------------
    // Constructor
    // -----------------------------------------------------------------------

    /// @param _owner          Contract owner (can update attestor & registry).
    /// @param _attestor       Initial attestor address.
    /// @param _agentRegistry  AgentRegistry contract address (zero to skip integration).
    constructor(
        address _owner,
        address _attestor,
        address _agentRegistry
    ) Ownable(_owner) {
        require(_attestor != address(0), "TEEVerifier: zero attestor");
        attestor = _attestor;
        agentRegistry = _agentRegistry;
    }

    // -----------------------------------------------------------------------
    // Admin setters
    // -----------------------------------------------------------------------

    /// @notice Update the authorised attestor address.
    function setAttestor(address _attestor) external onlyOwner {
        require(_attestor != address(0), "TEEVerifier: zero attestor");
        emit AttestorUpdated(attestor, _attestor);
        attestor = _attestor;
    }

    /// @notice Update the AgentRegistry reference.
    function setAgentRegistry(address _agentRegistry) external onlyOwner {
        emit AgentRegistryUpdated(agentRegistry, _agentRegistry);
        agentRegistry = _agentRegistry;
    }

    /// @notice Update the default TTL applied when `expiresAt` is not specified.
    function setDefaultTTL(uint256 _ttl) external onlyOwner {
        require(_ttl > 0, "TEEVerifier: zero TTL");
        emit AttestationTTLUpdated(defaultTTL, _ttl);
        defaultTTL = _ttl;
    }

    // -----------------------------------------------------------------------
    // Core: submitAttestation
    // -----------------------------------------------------------------------

    /// @inheritdoc ITEEAttestationVerifier
    function submitAttestation(
        uint256 agentId,
        bytes32 codeHash,
        bytes32 measurement,
        EnclaveType enclaveType,
        uint256 expiresAt
    ) external override onlyAttestor {
        require(codeHash != bytes32(0), "TEEVerifier: zero codeHash");
        require(measurement != bytes32(0), "TEEVerifier: zero measurement");

        uint256 expiry = expiresAt > block.timestamp ? expiresAt : block.timestamp + defaultTTL;

        _records[agentId] = AttestationRecord({
            codeHash: codeHash,
            measurement: measurement,
            enclaveType: enclaveType,
            status: Status.VERIFIED,
            verifiedAt: block.timestamp,
            expiresAt: expiry,
            attestor: msg.sender
        });

        emit AttestationSubmitted(agentId, codeHash, measurement, expiry);

        // ----- AgentRegistry integration -----
        // If a registry is configured, call `verifyCode` so the agent's
        // `codeVerified` flag is set atomically.
        if (agentRegistry != address(0)) {
            // Build a minimal attestation payload: (measurement, enclaveType, expiry).
            bytes memory attestationData = abi.encode(measurement, enclaveType, expiry);

            // solhint-disable-next-line avoid-low-level-calls
            (bool success, ) = agentRegistry.call(
                abi.encodeWithSignature(
                    "verifyCode(uint256,bytes32,bytes)",
                    agentId,
                    codeHash,
                    attestationData
                )
            );

            // We intentionally do not revert if the registry call fails — the
            // attestation record is still stored in this contract.  The registry
            // may reject the call if this contract is not set as the `protocol`.
            if (!success) {
                // Emit nothing extra — callers can check the registry separately.
            }
        }
    }

    // -----------------------------------------------------------------------
    // Core: revokeAttestation
    // -----------------------------------------------------------------------

    /// @inheritdoc ITEEAttestationVerifier
    function revokeAttestation(uint256 agentId) external override onlyAttestorOrOwner {
        AttestationRecord storage record = _records[agentId];
        require(
            record.status == Status.VERIFIED || record.status == Status.EXPIRED,
            "TEEVerifier: nothing to revoke"
        );

        record.status = Status.REVOKED;

        emit AttestationRevoked(agentId);
    }

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    /// @inheritdoc ITEEAttestationVerifier
    function getAttestation(uint256 agentId) external view override returns (AttestationRecord memory) {
        return _records[agentId];
    }

    /// @inheritdoc ITEEAttestationVerifier
    function isAttestationValid(uint256 agentId) external view override returns (bool) {
        AttestationRecord storage record = _records[agentId];
        if (record.status != Status.VERIFIED) return false;
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp < record.expiresAt;
    }

    /// @notice Convenience: check multiple agents in one call.
    function batchIsValid(uint256[] calldata agentIds) external view returns (bool[] memory) {
        bool[] memory results = new bool[](agentIds.length);
        for (uint256 i = 0; i < agentIds.length; i++) {
            AttestationRecord storage record = _records[agentIds[i]];
            results[i] = record.status == Status.VERIFIED && block.timestamp < record.expiresAt;
        }
        return results;
    }
}
