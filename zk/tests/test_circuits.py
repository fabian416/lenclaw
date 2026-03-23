#!/usr/bin/env python3
"""
Lenclaw ZK Circuit Tests

Tests for the ZK proof system including:
  - Prover input generation
  - Code packing and hashing
  - Revenue tier computation
  - Reputation band computation
  - Proof JSON structure
  - Local verification
  - Nargo integration (requires nargo CLI)

Run with:
    cd zk && python -m pytest tests/test_circuits.py -v

For nargo integration tests:
    cd zk && python -m pytest tests/test_circuits.py -v -m nargo
"""

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

# Add prover directory to path
PROVER_DIR = Path(__file__).parent.parent / "prover"
sys.path.insert(0, str(PROVER_DIR))

from prove import (
    AgentData,
    PublicInputs,
    pack_code_to_fields,
    compute_poseidon_hash_placeholder,
    compute_revenue_tier,
    compute_reputation_band,
    generate_prover_toml,
    generate_proof_json,
    MAX_CODE_FIELDS,
)
from verify import (
    verify_proof_structure,
    VerificationResult,
    REVENUE_TIER_BOUNDS,
    REPUTATION_BAND_BOUNDS,
)


# ===========================================================================
# Fixtures
# ===========================================================================

@pytest.fixture
def sample_code_bytes():
    """Sample code bytes for testing."""
    return b"def hello():\n    return 'world'\n"


@pytest.fixture
def sample_agent_data():
    """Sample AgentData for testing."""
    code_fields = [0] * MAX_CODE_FIELDS
    code_fields[0] = 0x48  # 'H'
    code_fields[1] = 0x65  # 'e'
    code_fields[2] = 0x6C  # 'l'
    code_fields[3] = 0x6C  # 'l'
    code_fields[4] = 0x6F  # 'o'
    return AgentData(
        agent_id=42,
        actual_revenue=500_000_000,  # 500 USDT
        code_fields=code_fields,
        code_length=5,
        actual_reputation=800,
    )


@pytest.fixture
def sample_public_inputs():
    """Sample PublicInputs for testing."""
    return PublicInputs(
        revenue_threshold=100_000_000,  # 100 USDT
        registered_code_hash="0x1234567890abcdef",
        min_reputation=600,
        agent_id=42,
    )


@pytest.fixture
def sample_proof_json():
    """Sample proof JSON for testing verification."""
    return {
        "proof": "0x" + "ab" * 608,  # 608 bytes, 32-byte aligned
        "publicInputs": {
            "revenueThreshold": 100_000_000,
            "registeredCodeHash": "0x1234567890abcdef",
            "minReputation": 600,
            "agentId": 42,
        },
        "outputs": {
            "revenueTier": 2,
            "reputationBand": 3,
        },
        "metadata": {
            "circuit": "lenclaw_credit_proof",
            "proofSystem": "UltraPlonk",
            "proofFile": "test.proof",
        },
    }


# ===========================================================================
# Code Packing Tests
# ===========================================================================

class TestCodePacking:
    """Tests for code byte packing into field elements."""

    def test_pack_small_code(self, sample_code_bytes):
        """Small code should pack correctly with zero padding."""
        fields, length = pack_code_to_fields(sample_code_bytes)

        assert length == len(sample_code_bytes)
        assert len(fields) == MAX_CODE_FIELDS

        # Check first bytes match
        for i, byte in enumerate(sample_code_bytes):
            assert fields[i] == byte

        # Check padding is zero
        for i in range(len(sample_code_bytes), MAX_CODE_FIELDS):
            assert fields[i] == 0

    def test_pack_single_byte(self):
        """Single byte packing."""
        fields, length = pack_code_to_fields(b"\x42")
        assert length == 1
        assert fields[0] == 0x42
        assert fields[1] == 0

    def test_pack_max_size(self):
        """Code at exactly MAX_CODE_FIELDS should succeed."""
        code = bytes(range(256))  # 256 bytes
        fields, length = pack_code_to_fields(code)
        assert length == MAX_CODE_FIELDS

    def test_pack_oversized_fails(self):
        """Code exceeding MAX_CODE_FIELDS should raise ValueError."""
        code = b"\x00" * 257  # 257 bytes exceeds MAX_CODE_FIELDS (256)
        with pytest.raises(ValueError, match="Code too large"):
            pack_code_to_fields(code)

    def test_pack_empty(self):
        """Empty bytes should produce all-zero fields."""
        fields, length = pack_code_to_fields(b"")
        assert length == 0
        assert all(f == 0 for f in fields)


# ===========================================================================
# Hash Tests
# ===========================================================================

class TestCodeHash:
    """Tests for code hash computation."""

    def test_hash_deterministic(self):
        """Same input should produce same hash."""
        fields = [0] * MAX_CODE_FIELDS
        fields[0] = 42

        hash1 = compute_poseidon_hash_placeholder(fields)
        hash2 = compute_poseidon_hash_placeholder(fields)
        assert hash1 == hash2

    def test_hash_different_inputs(self):
        """Different inputs should produce different hashes."""
        fields1 = [0] * MAX_CODE_FIELDS
        fields1[0] = 1

        fields2 = [0] * MAX_CODE_FIELDS
        fields2[0] = 2

        hash1 = compute_poseidon_hash_placeholder(fields1)
        hash2 = compute_poseidon_hash_placeholder(fields2)
        assert hash1 != hash2

    def test_hash_format(self):
        """Hash should be a hex string starting with 0x."""
        fields = [0] * MAX_CODE_FIELDS
        h = compute_poseidon_hash_placeholder(fields)
        assert h.startswith("0x")
        # Should be valid hex
        int(h, 16)


# ===========================================================================
# Revenue Tier Tests
# ===========================================================================

class TestRevenueTier:
    """Tests for revenue tier computation."""

    @pytest.mark.parametrize("revenue,expected_tier", [
        (0, 0),
        (9_999, 0),
        (10_000, 1),
        (999_999, 1),
        (1_000_000, 2),
        (99_999_999, 2),
        (100_000_000, 3),
        (9_999_999_999, 3),
        (10_000_000_000, 4),
        (100_000_000_000, 4),
    ])
    def test_revenue_tiers(self, revenue, expected_tier):
        """Revenue tiers should match circuit logic."""
        assert compute_revenue_tier(revenue) == expected_tier

    def test_tier_bounds_match_constants(self):
        """Tier boundaries should match the verification constants."""
        for tier, bound in enumerate(REVENUE_TIER_BOUNDS):
            if tier == 0:
                assert compute_revenue_tier(0) == 0
            else:
                assert compute_revenue_tier(bound) == tier
                assert compute_revenue_tier(bound - 1) == tier - 1


# ===========================================================================
# Reputation Band Tests
# ===========================================================================

class TestReputationBand:
    """Tests for reputation band computation."""

    @pytest.mark.parametrize("score,expected_band", [
        (0, 0),
        (249, 0),
        (250, 1),
        (499, 1),
        (500, 2),
        (749, 2),
        (750, 3),
        (1000, 3),
    ])
    def test_reputation_bands(self, score, expected_band):
        """Reputation bands should match circuit logic."""
        assert compute_reputation_band(score) == expected_band

    def test_band_bounds_match_constants(self):
        """Band boundaries should match the verification constants."""
        for band, bound in enumerate(REPUTATION_BAND_BOUNDS):
            if band == 0:
                assert compute_reputation_band(0) == 0
            else:
                assert compute_reputation_band(bound) == band
                assert compute_reputation_band(bound - 1) == band - 1


# ===========================================================================
# Prover.toml Generation Tests
# ===========================================================================

class TestProverToml:
    """Tests for Prover.toml generation."""

    def test_generates_valid_toml(self, sample_agent_data, sample_public_inputs):
        """Generated TOML should contain all required fields."""
        toml = generate_prover_toml(sample_agent_data, sample_public_inputs)

        assert "actual_revenue" in toml
        assert "code_fields" in toml
        assert "code_length" in toml
        assert "actual_reputation" in toml
        assert "revenue_threshold" in toml
        assert "registered_code_hash" in toml
        assert "min_reputation" in toml
        assert "agent_id" in toml

    def test_toml_contains_values(self, sample_agent_data, sample_public_inputs):
        """TOML should contain the actual values."""
        toml = generate_prover_toml(sample_agent_data, sample_public_inputs)

        assert str(sample_agent_data.actual_revenue) in toml
        assert str(sample_agent_data.actual_reputation) in toml
        assert str(sample_public_inputs.revenue_threshold) in toml
        assert str(sample_public_inputs.min_reputation) in toml
        assert str(sample_public_inputs.agent_id) in toml


# ===========================================================================
# Proof JSON Tests
# ===========================================================================

class TestProofJson:
    """Tests for proof JSON generation."""

    def test_proof_json_structure(self, sample_public_inputs):
        """Generated JSON should have the correct structure."""
        proof_json = generate_proof_json(
            "deadbeef",
            sample_public_inputs,
            2,  # revenue tier
            3,  # reputation band
            "test.proof",
        )

        assert "proof" in proof_json
        assert "publicInputs" in proof_json
        assert "outputs" in proof_json
        assert "metadata" in proof_json

        assert proof_json["proof"] == "0xdeadbeef"
        assert proof_json["publicInputs"]["agentId"] == 42
        assert proof_json["outputs"]["revenueTier"] == 2
        assert proof_json["outputs"]["reputationBand"] == 3

    def test_proof_json_serializable(self, sample_public_inputs):
        """Proof JSON should be serializable to string."""
        proof_json = generate_proof_json(
            "deadbeef", sample_public_inputs, 2, 3, "test.proof"
        )
        json_str = json.dumps(proof_json)
        assert isinstance(json_str, str)

        # Should round-trip
        parsed = json.loads(json_str)
        assert parsed == proof_json


# ===========================================================================
# Verification Tests
# ===========================================================================

class TestVerification:
    """Tests for local proof verification."""

    def test_valid_proof_passes(self, sample_proof_json):
        """A well-formed proof should pass structural verification."""
        result = verify_proof_structure(sample_proof_json)
        assert result.valid is True
        assert len(result.checks_failed) == 0

    def test_missing_fields_fails(self):
        """Missing required fields should fail."""
        result = verify_proof_structure({})
        assert result.valid is False
        assert any("Missing" in f for f in result.checks_failed)

    def test_small_proof_fails(self, sample_proof_json):
        """Proof smaller than 608 bytes should fail."""
        sample_proof_json["proof"] = "0x" + "ab" * 100  # only 100 bytes
        result = verify_proof_structure(sample_proof_json)
        assert result.valid is False
        assert any("too small" in f for f in result.checks_failed)

    def test_invalid_reputation_fails(self, sample_proof_json):
        """Reputation outside 0-1000 should fail."""
        sample_proof_json["publicInputs"]["minReputation"] = 1500
        result = verify_proof_structure(sample_proof_json)
        assert result.valid is False

    def test_invalid_agent_id_fails(self, sample_proof_json):
        """Agent ID of 0 should fail."""
        sample_proof_json["publicInputs"]["agentId"] = 0
        result = verify_proof_structure(sample_proof_json)
        assert result.valid is False

    def test_invalid_revenue_tier_fails(self, sample_proof_json):
        """Revenue tier > 4 should fail."""
        sample_proof_json["outputs"]["revenueTier"] = 5
        result = verify_proof_structure(sample_proof_json)
        assert result.valid is False

    def test_invalid_reputation_band_fails(self, sample_proof_json):
        """Reputation band > 3 should fail."""
        sample_proof_json["outputs"]["reputationBand"] = 4
        result = verify_proof_structure(sample_proof_json)
        assert result.valid is False

    def test_non_hex_proof_fails(self, sample_proof_json):
        """Non-hex proof should fail."""
        sample_proof_json["proof"] = "0xGGGG"
        result = verify_proof_structure(sample_proof_json)
        assert result.valid is False

    def test_warnings_for_tier_threshold_mismatch(self, sample_proof_json):
        """Should warn when tier implies higher revenue than threshold."""
        # Revenue tier 4 implies >= 10B, but threshold is only 100M
        sample_proof_json["outputs"]["revenueTier"] = 4
        sample_proof_json["publicInputs"]["revenueThreshold"] = 100_000_000
        result = verify_proof_structure(sample_proof_json)
        assert result.valid is True  # Still valid, just a warning
        assert len(result.warnings) > 0


# ===========================================================================
# Integration Tests (require nargo)
# ===========================================================================

def is_nargo_installed() -> bool:
    """Check if nargo CLI is available."""
    try:
        result = subprocess.run(
            ["nargo", "--version"],
            capture_output=True,
            timeout=10,
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


nargo_available = pytest.mark.skipif(
    not is_nargo_installed(),
    reason="nargo CLI not installed",
)


class TestNargoIntegration:
    """Integration tests requiring nargo CLI."""

    @nargo_available
    def test_circuit_compiles(self):
        """The Noir circuit should compile without errors."""
        result = subprocess.run(
            ["nargo", "compile"],
            cwd=str(Path(__file__).parent.parent / "circuits"),
            capture_output=True,
            text=True,
            timeout=120,
        )
        assert result.returncode == 0, f"Compilation failed: {result.stderr}"

    @nargo_available
    def test_circuit_tests_pass(self):
        """The Noir circuit's built-in tests should pass."""
        result = subprocess.run(
            ["nargo", "test"],
            cwd=str(Path(__file__).parent.parent / "circuits"),
            capture_output=True,
            text=True,
            timeout=120,
        )
        assert result.returncode == 0, f"Circuit tests failed: {result.stderr}"


# ===========================================================================
# End-to-End Tests
# ===========================================================================

class TestEndToEnd:
    """End-to-end tests for the prove-verify pipeline."""

    def test_prove_and_verify_placeholder(self, tmp_path):
        """Generate a placeholder proof and verify it locally."""
        from prove import _do_generate

        output_file = str(tmp_path / "test_proof.json")

        # Generate with --skip-nargo
        exit_code = _do_generate(
            agent_id=42,
            revenue=500_000_000,
            code_file=None,
            reputation=800,
            revenue_threshold=100_000_000,
            min_reputation=600,
            registered_code_hash="0x1234567890abcdef",
            output=output_file,
            skip_nargo=True,
        )
        assert exit_code == 0

        # Read the proof
        proof_json = json.loads(Path(output_file).read_text())

        # Verify structure
        result = verify_proof_structure(proof_json)
        assert result.valid is True, f"Failed checks: {result.checks_failed}"

    def test_prove_fails_low_revenue(self, tmp_path):
        """Prover should fail pre-flight if revenue < threshold."""
        from prove import _do_generate

        output_file = str(tmp_path / "test_proof.json")

        exit_code = _do_generate(
            agent_id=42,
            revenue=50_000_000,  # 50 USDT < 100 USDT threshold
            code_file=None,
            reputation=800,
            revenue_threshold=100_000_000,
            min_reputation=600,
            registered_code_hash="0x1234567890abcdef",
            output=output_file,
            skip_nargo=True,
        )
        assert exit_code == 1

    def test_prove_fails_low_reputation(self, tmp_path):
        """Prover should fail pre-flight if reputation < minimum."""
        from prove import _do_generate

        output_file = str(tmp_path / "test_proof.json")

        exit_code = _do_generate(
            agent_id=42,
            revenue=500_000_000,
            code_file=None,
            reputation=400,  # Below min of 600
            revenue_threshold=100_000_000,
            min_reputation=600,
            registered_code_hash="0x1234567890abcdef",
            output=output_file,
            skip_nargo=True,
        )
        assert exit_code == 1
