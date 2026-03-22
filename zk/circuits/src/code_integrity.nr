/// Code Integrity Circuit
/// Proves that an agent's code produces a specific hash that matches the
/// registered code hash on-chain, WITHOUT revealing the actual code bytes.
///
/// Private inputs:
///   - code_bytes: array of bytes representing the agent's source code (kept secret)
/// Public inputs:
///   - registered_hash: the keccak/poseidon hash stored on-chain in AgentRegistry
/// Output:
///   - bool: true if hash(code_bytes) == registered_hash

use std::hash::poseidon2::Poseidon2;

/// Maximum code size in field elements for the circuit.
/// Each field element can hold ~254 bits. We pack code bytes into field elements.
/// 256 field elements * 31 bytes each = ~7.9 KB of code.
global MAX_CODE_FIELDS: u32 = 256;

/// Hash a fixed-size array of field elements representing code bytes using Poseidon2.
/// Poseidon2 is ZK-friendly and the standard hash in Noir 1.0+.
fn hash_code(code_fields: [Field; MAX_CODE_FIELDS]) -> Field {
    Poseidon2::hash(code_fields, MAX_CODE_FIELDS)
}

/// Verify that the hash of private code bytes matches a public registered hash.
/// The prover supplies the actual code (private), and the circuit checks that
/// its Poseidon hash equals the on-chain registered_hash (public).
pub fn verify_code_integrity(
    code_fields: [Field; MAX_CODE_FIELDS],
    code_length: u32,
    registered_hash: Field,
) -> bool {
    // Validate code_length is within bounds
    assert(code_length <= MAX_CODE_FIELDS, "Code length exceeds maximum");
    assert(code_length > 0, "Code must not be empty");

    // Ensure fields beyond code_length are zero-padded.
    // This prevents a malicious prover from hiding data in padding.
    for i in 0..MAX_CODE_FIELDS {
        if i >= code_length {
            assert(code_fields[i] == 0, "Padding fields must be zero");
        }
    }

    // Compute the Poseidon hash of the code fields
    let computed_hash = hash_code(code_fields);

    // Core constraint: computed hash must match registered hash
    assert(computed_hash == registered_hash, "Code hash does not match registered hash");

    true
}

/// Compute the Poseidon hash of code fields (utility for off-chain use).
/// This allows the prover to pre-compute the expected hash.
pub fn compute_code_hash(code_fields: [Field; MAX_CODE_FIELDS]) -> Field {
    hash_code(code_fields)
}

#[test]
fn test_code_integrity_valid() {
    // Create a simple test code array
    let mut code: [Field; MAX_CODE_FIELDS] = [0; MAX_CODE_FIELDS];
    code[0] = 0x48; // 'H'
    code[1] = 0x65; // 'e'
    code[2] = 0x6c; // 'l'
    code[3] = 0x6c; // 'l'
    code[4] = 0x6f; // 'o'

    // Compute the expected hash
    let expected_hash = compute_code_hash(code);

    // Verify should succeed
    let result = verify_code_integrity(code, 5, expected_hash);
    assert(result == true);
}

#[test(should_fail_with = "Code hash does not match registered hash")]
fn test_code_integrity_mismatch() {
    let mut code: [Field; MAX_CODE_FIELDS] = [0; MAX_CODE_FIELDS];
    code[0] = 0x48;
    code[1] = 0x65;

    // Use a fake hash that won't match
    let fake_hash: Field = 0x1234567890abcdef;

    let _ = verify_code_integrity(code, 2, fake_hash);
}

#[test(should_fail_with = "Code must not be empty")]
fn test_code_integrity_empty() {
    let code: [Field; MAX_CODE_FIELDS] = [0; MAX_CODE_FIELDS];
    let _ = verify_code_integrity(code, 0, 0);
}
