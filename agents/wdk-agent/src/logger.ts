/**
 * Structured logger for the WDK agent.
 */

import { LogLevel } from './config';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: string, module: string, message: string, data?: Record<string, unknown>): string {
  const ts = timestamp();
  const prefix = `[${ts}] [${level.toUpperCase().padEnd(5)}] [${module}]`;
  if (data && Object.keys(data).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(data)}`;
  }
  return `${prefix} ${message}`;
}

function createModuleLogger(module: string) {
  return {
    debug(message: string, data?: Record<string, unknown>): void {
      if (shouldLog('debug')) {
        console.log(formatMessage('debug', module, message, data));
      }
    },
    info(message: string, data?: Record<string, unknown>): void {
      if (shouldLog('info')) {
        console.log(formatMessage('info', module, message, data));
      }
    },
    warn(message: string, data?: Record<string, unknown>): void {
      if (shouldLog('warn')) {
        console.warn(formatMessage('warn', module, message, data));
      }
    },
    error(message: string, data?: Record<string, unknown>): void {
      if (shouldLog('error')) {
        console.error(formatMessage('error', module, message, data));
      }
    },
  };
}

/** Default logger (no module prefix) */
export const logger = createModuleLogger('agent');

/** Create a logger with a specific module name */
export function getLogger(module: string) {
  return createModuleLogger(module);
}
