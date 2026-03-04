// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITEEAttestationVerifier
/// @notice Interface for the on-chain TEE attestation verifier used by Lenclaw.
///         Stores per-agent attestation results and integrates with AgentRegistry
///         to update code-verification status.
interface ITEEAttestationVerifier {
    // -----------------------------------------------------------------------
    // Enums
    // -----------------------------------------------------------------------

    /// @notice Supported TEE enclave types.
    enum EnclaveType {
        SGX,   // Intel SGX / TDX
        NITRO  // AWS Nitro Enclaves
    }

    /// @notice Lifecycle status of an attestation record.
    enum Status {
        UNVERIFIED,
        VERIFIED,
        EXPIRED,
        REVOKED
    }

    // -----------------------------------------------------------------------
    // Structs
    // -----------------------------------------------------------------------

    /// @notice On-chain attestation record for a single agent.
    struct AttestationRecord {
        /// @notice SHA-256 hash of the agent binary / WASM that was measured.
        bytes32 codeHash;
        /// @notice MRENCLAVE (SGX) or PCR0 (Nitro) extracted from the quote.
        bytes32 measurement;
        /// @notice Enclave platform that produced the quote.
        EnclaveType enclaveType;
        /// @notice Current lifecycle status.
        Status status;
        /// @notice Block timestamp at which the attestation was recorded.
        uint256 verifiedAt;
        /// @notice Unix timestamp after which the attestation is considered stale.
        uint256 expiresAt;
        /// @notice Address of the off-chain attestor that submitted the result.
        address attestor;
    }

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event AttestationSubmitted(
        uint256 indexed agentId,
        bytes32 codeHash,
        bytes32 measurement,
        uint256 expiresAt
    );

    event AttestationRevoked(uint256 indexed agentId);

    event AttestorUpdated(address indexed oldAttestor, address indexed newAttestor);

    event AgentRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);

    event AttestationTTLUpdated(uint256 oldTTL, uint256 newTTL);

    // -----------------------------------------------------------------------
    // Write functions
    // -----------------------------------------------------------------------

    /// @notice Submit or update an attestation record for `agentId`.
    /// @dev Only callable by the authorised attestor address.
    /// @param agentId     Agent NFT ID in the AgentRegistry.
    /// @param codeHash    SHA-256 of the agent code running in the enclave.
    /// @param measurement MRENCLAVE / PCR0 extracted from the TEE quote.
    /// @param enclaveType Enclave platform (SGX or Nitro).
    /// @param expiresAt   Unix timestamp when the attestation expires.
    function submitAttestation(
        uint256 agentId,
        bytes32 codeHash,
        bytes32 measurement,
        EnclaveType enclaveType,
        uint256 expiresAt
    ) external;

    /// @notice Revoke an existing attestation, setting its status to REVOKED.
    /// @dev Only callable by the owner or the attestor.
    /// @param agentId Agent whose attestation should be revoked.
    function revokeAttestation(uint256 agentId) external;

    // -----------------------------------------------------------------------
    // View functions
    // -----------------------------------------------------------------------

    /// @notice Retrieve the full attestation record for an agent.
    function getAttestation(uint256 agentId) external view returns (AttestationRecord memory);

    /// @notice Check whether `agentId` has a VERIFIED attestation that has not expired.
    function isAttestationValid(uint256 agentId) external view returns (bool);

    /// @notice Return the address authorised to submit attestation results.
    function attestor() external view returns (address);
}
