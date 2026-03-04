import cron from "node-cron";
import { createLogger, format, transports } from "winston";
import { config, AttestationStatus } from "./config";
import {
  getAllAttestations,
  isAttestationValid,
  AttestationResult,
} from "./attestor";

const logger = createLogger({
  level: config.logLevel,
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Callback invoked by the scheduler when an agent needs re-attestation.
 * The implementation should trigger a new attestation flow (e.g. request
 * a fresh quote from the enclave and call `verifyAttestation`).
 */
export type ReattestationCallback = (agentId: number, previous: AttestationResult) => Promise<void>;

// ---------------------------------------------------------------------------
// Scheduler state
// ---------------------------------------------------------------------------

let scheduledTask: cron.ScheduledTask | null = null;
let reattestCallback: ReattestationCallback | null = null;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register the callback that the scheduler invokes when an agent requires
 * re-attestation.
 */
export function onReattestation(cb: ReattestationCallback): void {
  reattestCallback = cb;
}

/**
 * Start the cron-based re-attestation scheduler.
 *
 * On each tick the scheduler iterates over all stored attestation results and
 * triggers re-attestation for agents whose attestation is:
 *   - expired
 *   - failed
 *   - about to expire (within `expiryWarningSeconds`)
 */
export function startScheduler(): void {
  if (scheduledTask) {
    logger.warn("Scheduler already running — ignoring duplicate start");
    return;
  }

  const cronExpr = config.reattestationCron;

  if (!cron.validate(cronExpr)) {
    logger.error("Invalid cron expression for scheduler", { cronExpr });
    return;
  }

  logger.info("Starting re-attestation scheduler", { cron: cronExpr });

  scheduledTask = cron.schedule(cronExpr, async () => {
    logger.info("Re-attestation sweep started");
    await runReattestationSweep();
    logger.info("Re-attestation sweep complete");
  });
}

/**
 * Stop the scheduler gracefully.
 */
export function stopScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    logger.info("Scheduler stopped");
  }
}

/**
 * Execute a single re-attestation sweep (also called from the monitor).
 * Returns the list of agent IDs that were selected for re-attestation.
 */
export async function runReattestationSweep(): Promise<number[]> {
  const all = getAllAttestations();
  const now = Math.floor(Date.now() / 1000);
  const needsReattest: number[] = [];

  for (const [agentId, result] of all.entries()) {
    const expired = result.status === AttestationStatus.EXPIRED;
    const failed = result.status === AttestationStatus.FAILED;
    const aboutToExpire =
      result.status === AttestationStatus.VERIFIED &&
      result.expiresAt - now <= config.expiryWarningSeconds;
    const noLongerValid = !isAttestationValid(agentId);

    if (expired || failed || aboutToExpire || noLongerValid) {
      needsReattest.push(agentId);
    }
  }

  if (needsReattest.length === 0) {
    logger.info("All attestations are current — nothing to re-attest");
    return [];
  }

  logger.info("Agents requiring re-attestation", { agentIds: needsReattest });

  for (const agentId of needsReattest) {
    const previous = all.get(agentId);
    if (!previous) continue;

    if (reattestCallback) {
      try {
        await reattestCallback(agentId, previous);
      } catch (err) {
        logger.error("Re-attestation callback failed", {
          agentId,
          error: String(err),
        });
      }
    } else {
      logger.warn("No re-attestation callback registered", { agentId });
    }
  }

  return needsReattest;
}
