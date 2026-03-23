import express, { Request, Response, NextFunction } from "express";
import { ethers } from "ethers";
import { createLogger, format, transports } from "winston";

import { config, EnclaveType, AttestationStatus } from "./config";
import {
  verifyAttestation,
  getAttestationResult,
  isAttestationValid,
  AttestationQuote,
  AttestationResult,
} from "./attestor";
import { hashFile, hashHexString, hashUtf8, verifyCodeHash } from "./hasher";
import { startScheduler, stopScheduler, onReattestation } from "./scheduler";
import { startMonitor, stopMonitor, getRecentAlerts, onAlert } from "./monitor";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = createLogger({
  level: config.logLevel,
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// ---------------------------------------------------------------------------
// On-chain helpers
// ---------------------------------------------------------------------------

const TEE_VERIFIER_ABI = [
  "function submitAttestation(uint256 agentId, bytes32 codeHash, bytes32 measurement, uint8 enclaveType, uint256 expiresAt) external",
  "function revokeAttestation(uint256 agentId) external",
  "function getAttestation(uint256 agentId) external view returns (tuple(bytes32 codeHash, bytes32 measurement, uint8 enclaveType, uint8 status, uint256 verifiedAt, uint256 expiresAt, address attestor))",
  "function isAttestationValid(uint256 agentId) external view returns (bool)",
  "event AttestationSubmitted(uint256 indexed agentId, bytes32 codeHash, bytes32 measurement, uint256 expiresAt)",
  "event AttestationRevoked(uint256 indexed agentId)",
];

let provider: ethers.JsonRpcProvider | null = null;
let signer: ethers.Wallet | null = null;
let verifierContract: ethers.Contract | null = null;

function initChain(): void {
  if (!config.verifierContractAddress) {
    logger.warn("VERIFIER_CONTRACT_ADDRESS not set — on-chain submission disabled");
    return;
  }

  try {
    provider = new ethers.JsonRpcProvider(config.rpcUrl);
    signer = new ethers.Wallet(config.signerPrivateKey, provider);
    verifierContract = new ethers.Contract(
      config.verifierContractAddress,
      TEE_VERIFIER_ABI,
      signer
    );
    logger.info("On-chain connection initialised", {
      rpc: config.rpcUrl,
      verifier: config.verifierContractAddress,
      signer: signer.address,
    });
  } catch (err) {
    logger.error("Failed to initialise on-chain connection", { error: String(err) });
  }
}

async function submitOnChain(result: AttestationResult): Promise<string | null> {
  if (!verifierContract || !signer) {
    logger.warn("On-chain submission skipped — contract not initialised");
    return null;
  }

  try {
    const enclaveTypeNum = result.enclaveType === EnclaveType.SGX ? 0 : 1;
    const measurementBytes32 = ethers.zeroPadValue(
      "0x" + result.measurement.replace(/^0x/, "").substring(0, 64),
      32
    );

    const tx = await verifierContract.submitAttestation(
      result.agentId,
      result.codeHash,
      measurementBytes32,
      enclaveTypeNum,
      result.expiresAt
    );

    const receipt = await tx.wait();
    logger.info("On-chain attestation submitted", {
      agentId: result.agentId,
      txHash: receipt.hash,
    });

    return receipt.hash;
  } catch (err) {
    logger.error("On-chain submission failed", {
      agentId: result.agentId,
      error: String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json({ limit: "5mb" }));

// --------------- Health check ---------------

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// --------------- POST /attest ---------------
// Submit a TEE attestation quote for an agent.

interface AttestRequestBody {
  agentId: number;
  codeHash: string;
  quote: AttestationQuote;
  submitOnChain?: boolean;
}

app.post("/attest", async (req: Request, res: Response) => {
  try {
    const body = req.body as AttestRequestBody;

    if (!body.agentId || !body.codeHash || !body.quote) {
      res.status(400).json({ error: "Missing required fields: agentId, codeHash, quote" });
      return;
    }

    if (!Object.values(EnclaveType).includes(body.quote.enclaveType)) {
      res.status(400).json({
        error: `Invalid enclaveType: ${body.quote.enclaveType}. Must be one of: ${Object.values(EnclaveType).join(", ")}`,
      });
      return;
    }

    // Verify the attestation
    const result = verifyAttestation(body.agentId, body.codeHash, body.quote);

    // Optionally submit to the on-chain verifier
    let txHash: string | null = null;
    if (body.submitOnChain !== false && result.status === AttestationStatus.VERIFIED) {
      txHash = await submitOnChain(result);
    }

    res.status(result.status === AttestationStatus.VERIFIED ? 200 : 400).json({
      result,
      txHash,
    });
  } catch (err) {
    logger.error("POST /attest error", { error: String(err) });
    res.status(500).json({ error: "Internal server error" });
  }
});

// --------------- GET /status/:agentId ---------------
// Get the current attestation status for an agent.

app.get("/status/:agentId", async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.agentId, 10);

    if (isNaN(agentId) || agentId <= 0) {
      res.status(400).json({ error: "Invalid agentId" });
      return;
    }

    // Check local store first
    const localResult = getAttestationResult(agentId);
    const localValid = isAttestationValid(agentId);

    // Try to fetch on-chain status too
    let onChainResult: Record<string, unknown> | null = null;
    if (verifierContract) {
      try {
        const raw = await verifierContract.getAttestation(agentId);
        onChainResult = {
          codeHash: raw.codeHash,
          measurement: raw.measurement,
          enclaveType: Number(raw.enclaveType),
          status: Number(raw.status),
          verifiedAt: Number(raw.verifiedAt),
          expiresAt: Number(raw.expiresAt),
          attestor: raw.attestor,
        };
      } catch {
        // Agent may not have on-chain attestation yet
      }
    }

    if (!localResult && !onChainResult) {
      res.status(404).json({
        agentId,
        status: AttestationStatus.UNVERIFIED,
        message: "No attestation found for this agent",
      });
      return;
    }

    res.json({
      agentId,
      local: localResult
        ? { ...localResult, currentlyValid: localValid }
        : null,
      onChain: onChainResult,
    });
  } catch (err) {
    logger.error("GET /status/:agentId error", { error: String(err) });
    res.status(500).json({ error: "Internal server error" });
  }
});

// --------------- POST /verify ---------------
// Verify a code hash against a file, hex string, or source code.

interface VerifyRequestBody {
  /** The registered bytes32 code hash from AgentRegistry */
  registeredCodeHash: string;
  /** Provide exactly one of the following */
  filePath?: string;
  hexBytecode?: string;
  sourceCode?: string;
}

app.post("/verify", async (req: Request, res: Response) => {
  try {
    const body = req.body as VerifyRequestBody;

    if (!body.registeredCodeHash) {
      res.status(400).json({ error: "Missing registeredCodeHash" });
      return;
    }

    let computed;

    if (body.filePath) {
      computed = await hashFile(body.filePath);
    } else if (body.hexBytecode) {
      computed = hashHexString(body.hexBytecode);
    } else if (body.sourceCode) {
      computed = hashUtf8(body.sourceCode);
    } else {
      res.status(400).json({
        error: "Provide one of: filePath, hexBytecode, sourceCode",
      });
      return;
    }

    const matches = verifyCodeHash(computed, body.registeredCodeHash);

    res.json({
      matches,
      computed,
      registeredCodeHash: body.registeredCodeHash,
    });
  } catch (err) {
    logger.error("POST /verify error", { error: String(err) });
    res.status(500).json({ error: "Internal server error" });
  }
});

// --------------- GET /alerts ---------------
// Retrieve recent monitor alerts.

app.get("/alerts", (_req: Request, res: Response) => {
  res.json({ alerts: getRecentAlerts() });
});

// ---------------------------------------------------------------------------
// Error handling middleware
// ---------------------------------------------------------------------------

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Internal server error" });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

function main(): void {
  logger.info("Lenclaw TEE Attestation Service starting", {
    port: config.port,
    chainId: config.chainId,
  });

  // Initialise on-chain connection
  initChain();

  // Register re-attestation callback — requests a fresh quote from the enclave
  // agent when the attestation window expires.
  onReattestation(async (agentId, previous) => {
    logger.info("Re-attestation requested (no-op in standalone mode)", {
      agentId,
      previousStatus: previous.status,
    });
  });

  // Register alert logging
  onAlert((alert) => {
    logger.warn("Alert dispatched", alert);
  });

  // Start background daemons
  startScheduler();
  startMonitor();

  // Start HTTP server
  const server = app.listen(config.port, config.host, () => {
    logger.info(`Attestation service listening on ${config.host}:${config.port}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    logger.info("Shutting down...");
    stopScheduler();
    stopMonitor();
    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();

export { app };
