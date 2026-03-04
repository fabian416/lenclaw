import cron from "node-cron";
import { createLogger, format, transports } from "winston";
import { config, AttestationStatus } from "./config";
import {
  getAllAttestations,
  expireAttestation,
  AttestationResult,
} from "./attestor";
import { runReattestationSweep } from "./scheduler";

const logger = createLogger({
  level: config.logLevel,
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MonitorAlert {
  agentId: number;
  type: "expired" | "expiring_soon" | "failed" | "re_attestation_triggered";
  message: string;
  timestamp: number;
}

/** Callback for external alert sinks (webhook, PagerDuty, Slack, etc.). */
export type AlertCallback = (alert: MonitorAlert) => Promise<void> | void;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let monitorTask: cron.ScheduledTask | null = null;
let alertCallbacks: AlertCallback[] = [];
const recentAlerts: MonitorAlert[] = [];
const MAX_RECENT_ALERTS = 500;

// ---------------------------------------------------------------------------
// Alert helpers
// ---------------------------------------------------------------------------

function emitAlert(alert: MonitorAlert): void {
  recentAlerts.push(alert);
  if (recentAlerts.length > MAX_RECENT_ALERTS) {
    recentAlerts.shift();
  }

  logger.warn("MONITOR ALERT", alert);

  for (const cb of alertCallbacks) {
    try {
      cb(alert);
    } catch (err) {
      logger.error("Alert callback failed", { error: String(err) });
    }
  }
}

// ---------------------------------------------------------------------------
// Core sweep
// ---------------------------------------------------------------------------

/**
 * Perform a single monitoring sweep:
 *
 * 1. Walk all stored attestations.
 * 2. Mark any that have passed their `expiresAt` as EXPIRED.
 * 3. Emit alerts for expired, about-to-expire, and failed attestations.
 * 4. Trigger a re-attestation sweep for agents that need it.
 */
export async function monitorSweep(): Promise<MonitorAlert[]> {
  const now = Math.floor(Date.now() / 1000);
  const all = getAllAttestations();
  const alerts: MonitorAlert[] = [];

  for (const [agentId, result] of all.entries()) {
    // ------ Expire stale attestations ------
    if (
      result.status === AttestationStatus.VERIFIED &&
      now >= result.expiresAt
    ) {
      expireAttestation(agentId);

      const alert: MonitorAlert = {
        agentId,
        type: "expired",
        message: `Attestation for agent ${agentId} has expired (was valid until ${new Date(result.expiresAt * 1000).toISOString()})`,
        timestamp: now,
      };
      emitAlert(alert);
      alerts.push(alert);
      continue;
    }

    // ------ Warn about upcoming expiry ------
    if (
      result.status === AttestationStatus.VERIFIED &&
      result.expiresAt - now <= config.expiryWarningSeconds
    ) {
      const secsLeft = result.expiresAt - now;
      const alert: MonitorAlert = {
        agentId,
        type: "expiring_soon",
        message: `Attestation for agent ${agentId} expires in ${secsLeft}s (at ${new Date(result.expiresAt * 1000).toISOString()})`,
        timestamp: now,
      };
      emitAlert(alert);
      alerts.push(alert);
    }

    // ------ Alert on existing failures ------
    if (result.status === AttestationStatus.FAILED) {
      const alert: MonitorAlert = {
        agentId,
        type: "failed",
        message: `Attestation for agent ${agentId} is in FAILED state${result.error ? ": " + result.error : ""}`,
        timestamp: now,
      };
      emitAlert(alert);
      alerts.push(alert);
    }
  }

  // ------ Auto-trigger re-attestation ------
  if (alerts.length > 0) {
    logger.info("Monitor triggering re-attestation sweep", {
      alertCount: alerts.length,
    });

    const retriggered = await runReattestationSweep();

    for (const agentId of retriggered) {
      const alert: MonitorAlert = {
        agentId,
        type: "re_attestation_triggered",
        message: `Re-attestation triggered for agent ${agentId}`,
        timestamp: now,
      };
      emitAlert(alert);
      alerts.push(alert);
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register an external alert sink.
 */
export function onAlert(cb: AlertCallback): void {
  alertCallbacks.push(cb);
}

/**
 * Return the most recent alerts (up to MAX_RECENT_ALERTS).
 */
export function getRecentAlerts(): MonitorAlert[] {
  return [...recentAlerts];
}

/**
 * Start the monitor daemon on the configured cron schedule.
 */
export function startMonitor(): void {
  if (monitorTask) {
    logger.warn("Monitor already running — ignoring duplicate start");
    return;
  }

  const cronExpr = config.monitorCron;

  if (!cron.validate(cronExpr)) {
    logger.error("Invalid cron expression for monitor", { cronExpr });
    return;
  }

  logger.info("Starting attestation monitor daemon", { cron: cronExpr });

  monitorTask = cron.schedule(cronExpr, async () => {
    try {
      const alerts = await monitorSweep();
      if (alerts.length > 0) {
        logger.info("Monitor sweep produced alerts", { count: alerts.length });
      }
    } catch (err) {
      logger.error("Monitor sweep failed", { error: String(err) });
    }
  });
}

/**
 * Stop the monitor daemon.
 */
export function stopMonitor(): void {
  if (monitorTask) {
    monitorTask.stop();
    monitorTask = null;
    logger.info("Monitor stopped");
  }
}
