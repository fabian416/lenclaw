import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { createLogger, format, transports } from "winston";
import { config } from "./config";

const logger = createLogger({
  level: config.logLevel,
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** The result of hashing an agent's code artefact. */
export interface HashResult {
  /** Hex-encoded SHA-256 digest (no 0x prefix). */
  hex: string;

  /** The same digest as a 0x-prefixed bytes32 suitable for Solidity. */
  bytes32: string;

  /** Size of the input in bytes. */
  sizeBytes: number;

  /** ISO-8601 timestamp when the hash was computed. */
  computedAt: string;
}

// ---------------------------------------------------------------------------
// Core hashing
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 over a raw `Buffer`.
 * Works for any binary payload: ELF, WASM, JS bundles, etc.
 */
export function hashBuffer(data: Buffer): HashResult {
  const digest = createHash("sha256").update(data).digest("hex");
  return {
    hex: digest,
    bytes32: "0x" + digest,
    sizeBytes: data.length,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Hash a file on disk by reading it entirely into memory.
 * Suitable for agent binaries, WASM modules, or bundled JS.
 */
export async function hashFile(filePath: string): Promise<HashResult> {
  logger.info("Hashing file", { filePath });
  const data = await readFile(filePath);
  return hashBuffer(data);
}

/**
 * Hash a hex-encoded string (e.g. contract bytecode retrieved from an RPC node).
 * Strips the leading `0x` if present before hashing the raw bytes.
 */
export function hashHexString(hex: string): HashResult {
  const cleaned = hex.startsWith("0x") ? hex.slice(2) : hex;
  const data = Buffer.from(cleaned, "hex");
  return hashBuffer(data);
}

/**
 * Hash a UTF-8 string directly (useful for hashing source code).
 */
export function hashUtf8(source: string): HashResult {
  const data = Buffer.from(source, "utf-8");
  return hashBuffer(data);
}

// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

/**
 * Constant-time comparison of two hex digests.
 * Returns `true` when the digests are identical.
 */
export function compareHashes(a: string, b: string): boolean {
  const normalise = (h: string) => h.toLowerCase().replace(/^0x/, "");
  const aN = normalise(a);
  const bN = normalise(b);

  if (aN.length !== bN.length) return false;

  // Constant-time comparison to prevent timing side-channels.
  let diff = 0;
  for (let i = 0; i < aN.length; i++) {
    diff |= aN.charCodeAt(i) ^ bN.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Compare a freshly-computed hash result against a registered bytes32 code hash
 * from the AgentRegistry contract.
 */
export function verifyCodeHash(
  computed: HashResult,
  registeredBytes32: string
): boolean {
  logger.info("Verifying code hash", {
    computed: computed.bytes32,
    registered: registeredBytes32,
  });
  return compareHashes(computed.bytes32, registeredBytes32);
}
