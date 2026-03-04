# Lenclaw TEE Verification System

Trusted Execution Environment (TEE) attestation infrastructure for the Lenclaw protocol. This system ensures that AI agents are running the exact code they registered on-chain, preventing agents from registering honest code but executing malicious code.

## Architecture

```
+---------------------+       +--------------------------+       +------------------+
|  Agent in TEE       |       |  Attestation Service     |       |  On-Chain        |
|  (SGX / Nitro)      | ----> |  (Node.js / Express)     | ----> |  Contracts       |
|                     |       |                          |       |                  |
|  Generates quote    |       |  POST /attest            |       |  TEEAttestation  |
|  with code measure  |       |  - Parses quote          |       |  Verifier.sol    |
|                     |       |  - Verifies report data  |       |                  |
|                     |       |  - Submits on-chain      |       |  AgentRegistry   |
+---------------------+       +--------------------------+       +------------------+
                                     |           |
                              +------+    +------+
                              |           |
                        Scheduler    Monitor
                        (cron)       (cron)
                        Re-attest    Expiry alerts
```

## Components

### attestation-service/ (TypeScript Node.js)

Off-chain service that receives TEE attestation quotes, verifies them, and submits results on-chain.

| File | Purpose |
|------|---------|
| `src/index.ts` | Express server with REST API endpoints |
| `src/attestor.ts` | Core attestation logic: parse SGX/Nitro quotes, verify measurements and report data |
| `src/hasher.ts` | SHA-256 code hashing for binaries, WASM, and source code |
| `src/config.ts` | Service configuration from environment variables |
| `src/scheduler.ts` | Cron-based periodic re-attestation scheduler |
| `src/monitor.ts` | Daemon that watches attestation expiry, emits alerts, and auto-triggers re-attestation |

### contracts/ (Solidity)

On-chain verifier that stores attestation results and integrates with the AgentRegistry.

| File | Purpose |
|------|---------|
| `src/TEEAttestationVerifier.sol` | On-chain verifier contract |
| `src/ITEEAttestationVerifier.sol` | Interface |

## Quick Start

### Prerequisites

- Node.js >= 20
- Foundry (for Solidity contracts)
- An EVM-compatible RPC endpoint

### Attestation Service

```bash
cd attestation-service

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your values (see Configuration below)

# Build
npm run build

# Run in development
npm run dev

# Run production build
npm start
```

### Contracts

The TEE contracts use the same Foundry project as the main Lenclaw contracts. From the repository root:

```bash
cd contracts
forge build
```

Deploy the verifier:

```bash
forge create src/TEEAttestationVerifier.sol:TEEAttestationVerifier \
  --constructor-args <owner> <attestor> <agentRegistry> \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_KEY
```

After deployment, set the verifier contract as the `protocol` on the AgentRegistry so it can call `verifyCode`:

```bash
cast send <AgentRegistry> "setProtocol(address)" <TEEAttestationVerifier> \
  --rpc-url $RPC_URL \
  --private-key $OWNER_KEY
```

## Configuration

All configuration is via environment variables (or a `.env` file).

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3300` | HTTP port for the attestation API |
| `HOST` | `0.0.0.0` | Bind address |
| `RPC_URL` | `http://127.0.0.1:8545` | EVM JSON-RPC endpoint |
| `CHAIN_ID` | `31337` | Target chain ID |
| `VERIFIER_CONTRACT_ADDRESS` | (empty) | Deployed TEEAttestationVerifier address |
| `AGENT_REGISTRY_ADDRESS` | (empty) | Deployed AgentRegistry address |
| `SIGNER_PRIVATE_KEY` | Hardhat default #0 | Private key for the attestor signer |
| `ATTESTATION_TTL_SECONDS` | `86400` | Attestation validity period (24h) |
| `REATTESTATION_CRON` | `0 */6 * * *` | Cron schedule for re-attestation sweeps |
| `MONITOR_CRON` | `*/5 * * * *` | Cron schedule for expiry monitoring |
| `EXPIRY_WARNING_SECONDS` | `3600` | Warn when attestation expires within this window |
| `LOG_LEVEL` | `info` | Winston log level |

## API Reference

### POST /attest

Submit a TEE attestation quote for verification.

**Request body:**

```json
{
  "agentId": 1,
  "codeHash": "0xabc123...",
  "quote": {
    "enclaveType": "sgx",
    "rawQuote": "<base64-encoded quote>",
    "measurement": "<hex MRENCLAVE or PCR0>",
    "signerMeasurement": "<hex MRSIGNER or PCR1>",
    "reportData": "<hex report data>",
    "certificateChain": "<optional PEM cert chain>",
    "signature": "<optional hex signature>"
  },
  "submitOnChain": true
}
```

**Response (200):**

```json
{
  "result": {
    "agentId": 1,
    "codeHash": "0xabc123...",
    "measurement": "...",
    "signerMeasurement": "...",
    "enclaveType": "sgx",
    "status": "verified",
    "verifiedAt": 1700000000,
    "expiresAt": 1700086400,
    "reportDataValid": true,
    "signatureValid": false
  },
  "txHash": "0x..."
}
```

### GET /status/:agentId

Retrieve current attestation status (both local and on-chain).

**Response (200):**

```json
{
  "agentId": 1,
  "local": {
    "status": "verified",
    "currentlyValid": true,
    "...": "..."
  },
  "onChain": {
    "codeHash": "0x...",
    "status": 1,
    "...": "..."
  }
}
```

### POST /verify

Verify a code hash against a file, hex bytecode, or source string.

**Request body (one of):**

```json
{
  "registeredCodeHash": "0xabc123...",
  "filePath": "/path/to/agent.wasm"
}
```

```json
{
  "registeredCodeHash": "0xabc123...",
  "hexBytecode": "0x6080604052..."
}
```

```json
{
  "registeredCodeHash": "0xabc123...",
  "sourceCode": "console.log('hello');"
}
```

### GET /alerts

Retrieve recent monitor alerts.

### GET /health

Health check endpoint.

## Attestation Flow

1. **Agent registers** on-chain via `AgentRegistry.registerAgent(wallet, codeHash, metadata)`. The `codeHash` is the SHA-256 of the agent's binary/WASM.

2. **Agent starts in a TEE** (SGX enclave or Nitro enclave). The enclave generates an attestation quote that includes:
   - Code measurement (MRENCLAVE / PCR0) -- proves which binary is running
   - Report data: `SHA-256(agentId || codeHash)` -- binds the quote to the agent's identity

3. **Quote submitted** to the attestation service via `POST /attest`. The service:
   - Parses the quote format (SGX DCAP or Nitro COSE)
   - Extracts and verifies the measurement
   - Checks report-data binding (`agentId + codeHash`)
   - Verifies the platform signature (when certificate chain is provided)

4. **On-chain submission**: If verification passes, the service calls `TEEAttestationVerifier.submitAttestation(...)` which:
   - Stores the attestation record
   - Calls `AgentRegistry.verifyCode(agentId, codeHash, attestation)` to set `codeVerified = true`

5. **Ongoing monitoring**: The scheduler and monitor daemons periodically:
   - Check for expiring attestations
   - Emit alerts
   - Trigger re-attestation flows

## Security Considerations

- The `attestor` address is the only account that can submit attestation results on-chain. Guard its private key carefully.
- In production, always verify platform signatures (Intel IAS / DCAP or AWS Nitro root CA). The current implementation supports signature verification when certificates are provided.
- Report-data binding is critical: it prevents replay attacks where a valid quote from one agent is submitted for a different agent.
- The default TTL is 24 hours. Adjust based on your threat model.
- The monitor daemon provides defense-in-depth by catching expired attestations even if the scheduler misses a cycle.
