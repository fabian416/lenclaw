import { createHash, createVerify } from "crypto";
import { createLogger, format, transports } from "winston";
import { config, EnclaveType, AttestationStatus } from "./config";
import { compareHashes } from "./hasher";

const logger = createLogger({
  level: config.logLevel,
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw attestation quote submitted by an agent's TEE enclave. */
export interface AttestationQuote {
  /** Enclave platform that generated the quote. */
  enclaveType: EnclaveType;

  /** Base-64 encoded binary quote blob (SGX ECDSA quote or Nitro attestation document). */
  rawQuote: string;

  /** Hex-encoded MRENCLAVE (SGX) or PCR0 (Nitro). */
  measurement: string;

  /** Hex-encoded MRSIGNER (SGX) or PCR1 (Nitro). Identifies the entity that signed the enclave. */
  signerMeasurement: string;

  /**
   * Hex-encoded report data (64 bytes).
   * Conventionally this is SHA-256(agentId ++ codeHash) to bind the quote to
   * the agent's identity and the exact binary running inside the enclave.
   */
  reportData: string;

  /** Optional: DER/PEM encoded certificate chain from the platform (IAS cert, Nitro CA). */
  certificateChain?: string;

  /** Optional: hex-encoded signature over the quote body. */
  signature?: string;
}

/** The verified result produced after parsing and checking a quote. */
export interface AttestationResult {
  agentId: number;
  codeHash: string;
  measurement: string;
  signerMeasurement: string;
  enclaveType: EnclaveType;
  status: AttestationStatus;
  verifiedAt: number; // unix epoch seconds
  expiresAt: number;  // unix epoch seconds
  reportDataValid: boolean;
  signatureValid: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// In-memory store (production would use a database)
// ---------------------------------------------------------------------------

const attestationStore = new Map<number, AttestationResult>();

export function getAttestationResult(agentId: number): AttestationResult | undefined {
  return attestationStore.get(agentId);
}

export function getAllAttestations(): Map<number, AttestationResult> {
  return attestationStore;
}

// ---------------------------------------------------------------------------
// Report-data binding
// ---------------------------------------------------------------------------

/**
 * Build the expected 64-byte report data for a given agent.
 *
 * Layout: SHA-256( uint256(agentId) ++ bytes32(codeHash) )
 * Zero-padded to 64 bytes (32-byte digest + 32 zero bytes).
 */
export function buildExpectedReportData(agentId: number, codeHash: string): string {
  const agentIdHex = agentId.toString(16).padStart(64, "0");
  const cleanCodeHash = codeHash.replace(/^0x/, "").padStart(64, "0");
  const preimage = Buffer.from(agentIdHex + cleanCodeHash, "hex");
  const digest = createHash("sha256").update(preimage).digest("hex");
  // Pad to 64 bytes (128 hex chars) — matches SGX REPORTDATA length
  return digest.padEnd(128, "0");
}

// ---------------------------------------------------------------------------
// SGX quote parsing
// ---------------------------------------------------------------------------

interface SgxQuoteFields {
  version: number;
  measurement: string;   // MRENCLAVE — 32 bytes at offset 112
  signerMeasurement: string; // MRSIGNER — 32 bytes at offset 176
  reportData: string;    // 64 bytes at offset 368
}

/**
 * Parse a minimal set of fields from an SGX DCAP/ECDSA quote.
 * Quote layout (v3): https://download.01.org/intel-sgx/latest/dcap-latest/linux/docs/
 */
function parseSgxQuote(rawBase64: string): SgxQuoteFields {
  const buf = Buffer.from(rawBase64, "base64");

  if (buf.length < 432) {
    throw new Error(`SGX quote too short: ${buf.length} bytes (minimum 432)`);
  }

  const version = buf.readUInt16LE(0);
  if (version !== 3 && version !== 4) {
    logger.warn("Unexpected SGX quote version", { version });
  }

  const measurement = buf.subarray(112, 144).toString("hex");
  const signerMeasurement = buf.subarray(176, 208).toString("hex");
  const reportData = buf.subarray(368, 432).toString("hex");

  return { version, measurement, signerMeasurement, reportData };
}

// ---------------------------------------------------------------------------
// Nitro attestation document parsing
// ---------------------------------------------------------------------------

interface NitroDocFields {
  pcr0: string;  // Code measurement
  pcr1: string;  // Kernel / configuration
  reportData: string;
}

/**
 * Parse an AWS Nitro Enclaves attestation document.
 *
 * Nitro attestation documents are CBOR-encoded COSE_Sign1 structures.
 * For a production implementation you would use a CBOR library and verify
 * the signature against the AWS Nitro root CA.  Here we implement a
 * simplified extraction that expects the caller to provide measurements
 * alongside the raw document (the measurements are still compared).
 */
function parseNitroDocument(rawBase64: string): NitroDocFields {
  const buf = Buffer.from(rawBase64, "base64");

  if (buf.length < 100) {
    throw new Error(`Nitro document too short: ${buf.length} bytes`);
  }

  // -----------------------------------------------------------------------
  // Simplified extraction: scan the CBOR payload for known PCR map markers.
  // In production, replace with a full CBOR/COSE parser + AWS root CA
  // verification.
  // -----------------------------------------------------------------------

  // Try to find PCR0 (48 bytes for SHA-384 in Nitro).  We look for the CBOR
  // unsigned integer 0 (one byte 0x00) followed by a byte-string header for
  // 48 bytes (0x58 0x30).
  const pcr0Marker = buf.indexOf(Buffer.from([0x00, 0x58, 0x30]));
  let pcr0 = "0".repeat(96); // fallback zeros
  if (pcr0Marker !== -1 && pcr0Marker + 3 + 48 <= buf.length) {
    pcr0 = buf.subarray(pcr0Marker + 3, pcr0Marker + 3 + 48).toString("hex");
  }

  const pcr1Marker = buf.indexOf(Buffer.from([0x01, 0x58, 0x30]));
  let pcr1 = "0".repeat(96);
  if (pcr1Marker !== -1 && pcr1Marker + 3 + 48 <= buf.length) {
    pcr1 = buf.subarray(pcr1Marker + 3, pcr1Marker + 3 + 48).toString("hex");
  }

  // Report data / user data — look for the CBOR text key "user_data"
  const userDataKey = Buffer.from("user_data");
  const udIdx = buf.indexOf(userDataKey);
  let reportData = "0".repeat(128);
  if (udIdx !== -1) {
    // After the key there is a CBOR byte string header.  Handle both
    // short (1-byte length) and 2-byte length forms.
    const afterKey = udIdx + userDataKey.length;
    if (afterKey + 1 < buf.length) {
      const header = buf[afterKey];
      let dataStart = afterKey + 1;
      let dataLen = 64;

      if (header === 0x58) {
        // 1-byte uint8 length follows
        dataLen = buf[afterKey + 1];
        dataStart = afterKey + 2;
      } else if ((header & 0xe0) === 0x40) {
        // Major type 2 (byte string), additional info encodes length < 24
        dataLen = header & 0x1f;
      }

      if (dataStart + dataLen <= buf.length) {
        reportData = buf.subarray(dataStart, dataStart + dataLen).toString("hex");
        // Pad / truncate to 128 hex chars (64 bytes)
        reportData = reportData.padEnd(128, "0").substring(0, 128);
      }
    }
  }

  return { pcr0, pcr1, reportData };
}

// ---------------------------------------------------------------------------
// Signature verification helpers
// ---------------------------------------------------------------------------

/**
 * Verify an ECDSA signature over a SHA-256 digest of the quote body.
 *
 * In production this would verify against the Intel Attestation Service (IAS)
 * signing key or the AWS Nitro root CA public key.  The current implementation
 * supports a PEM public key supplied via the certificate chain field.
 */
function verifyQuoteSignature(
  rawBase64: string,
  signatureHex: string | undefined,
  certificateChainPem: string | undefined
): boolean {
  if (!signatureHex || !certificateChainPem) {
    logger.warn("Signature or certificate chain missing — skipping sig verification");
    return false;
  }

  try {
    const quoteBytes = Buffer.from(rawBase64, "base64");
    const signature = Buffer.from(signatureHex, "hex");

    const verifier = createVerify("SHA256");
    verifier.update(quoteBytes);
    verifier.end();

    return verifier.verify(certificateChainPem, signature);
  } catch (err) {
    logger.error("Signature verification threw", { error: String(err) });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full attestation pipeline:
 * 1. Parse the quote (SGX or Nitro)
 * 2. Verify report-data binding (agentId + codeHash)
 * 3. Verify platform signature (if provided)
 * 4. Optionally compare extracted measurement against caller-supplied value
 * 5. Persist result and return it
 */
export function verifyAttestation(
  agentId: number,
  codeHash: string,
  quote: AttestationQuote
): AttestationResult {
  const now = Math.floor(Date.now() / 1000);

  const base: Omit<AttestationResult, "status" | "reportDataValid" | "signatureValid" | "error"> = {
    agentId,
    codeHash,
    measurement: quote.measurement,
    signerMeasurement: quote.signerMeasurement,
    enclaveType: quote.enclaveType,
    verifiedAt: now,
    expiresAt: now + config.attestationTtlSeconds,
  };

  try {
    // ----- 1. Parse platform-specific quote -----
    let extractedMeasurement: string;
    let extractedReportData: string;

    if (quote.enclaveType === EnclaveType.SGX) {
      const fields = parseSgxQuote(quote.rawQuote);
      extractedMeasurement = fields.measurement;
      extractedReportData = fields.reportData;

      logger.info("Parsed SGX quote", {
        version: fields.version,
        mrenclave: extractedMeasurement.substring(0, 16) + "...",
      });
    } else if (quote.enclaveType === EnclaveType.NITRO) {
      const fields = parseNitroDocument(quote.rawQuote);
      extractedMeasurement = fields.pcr0;
      extractedReportData = fields.reportData;

      logger.info("Parsed Nitro document", {
        pcr0: extractedMeasurement.substring(0, 16) + "...",
      });
    } else {
      throw new Error(`Unsupported enclave type: ${quote.enclaveType}`);
    }

    // ----- 2. Verify measurement matches what the caller declared -----
    const measurementMatch = compareHashes(extractedMeasurement, quote.measurement);
    if (!measurementMatch) {
      logger.warn("Measurement mismatch", {
        extracted: extractedMeasurement,
        declared: quote.measurement,
      });
    }

    // ----- 3. Verify report-data binding -----
    const expectedReportData = buildExpectedReportData(agentId, codeHash);
    const reportDataValid = compareHashes(
      extractedReportData.substring(0, 64), // first 32 bytes (SHA-256 digest)
      expectedReportData.substring(0, 64)
    );

    if (!reportDataValid) {
      logger.warn("Report-data binding failed", {
        agentId,
        extracted: extractedReportData.substring(0, 32) + "...",
        expected: expectedReportData.substring(0, 32) + "...",
      });
    }

    // ----- 4. Verify platform signature -----
    const signatureValid = verifyQuoteSignature(
      quote.rawQuote,
      quote.signature,
      quote.certificateChain
    );

    // ----- 5. Determine overall status -----
    // We require report-data binding.  Signature is optional for dev/test but
    // logged.  In production you would also require `signatureValid`.
    const status: AttestationStatus = reportDataValid
      ? AttestationStatus.VERIFIED
      : AttestationStatus.FAILED;

    const result: AttestationResult = {
      ...base,
      status,
      reportDataValid,
      signatureValid,
    };

    attestationStore.set(agentId, result);
    logger.info("Attestation complete", { agentId, status });

    return result;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Attestation failed", { agentId, error: message });

    const result: AttestationResult = {
      ...base,
      status: AttestationStatus.FAILED,
      reportDataValid: false,
      signatureValid: false,
      error: message,
    };

    attestationStore.set(agentId, result);
    return result;
  }
}

/**
 * Check whether a previously-stored attestation is still within its TTL.
 */
export function isAttestationValid(agentId: number): boolean {
  const result = attestationStore.get(agentId);
  if (!result) return false;
  if (result.status !== AttestationStatus.VERIFIED) return false;
  return Math.floor(Date.now() / 1000) < result.expiresAt;
}

/**
 * Mark an attestation as expired (called by the monitor when TTL elapses).
 */
export function expireAttestation(agentId: number): void {
  const result = attestationStore.get(agentId);
  if (result) {
    result.status = AttestationStatus.EXPIRED;
    attestationStore.set(agentId, result);
    logger.info("Attestation expired", { agentId });
  }
}
