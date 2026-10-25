/**
 * Every log level, most severe first. The position is the order a threshold applies: a
 * logger or transport set to `info` emits `error`, `warn`, and `info` and skips the rest.
 */
export const LOG_LEVELS = ['error', 'warn', 'info', 'verbose', 'debug', 'silly'] as const;

/**
 * A log level.
 * @type {LogLevel}
 * @public
 */
export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * Whether a value from a config file or a decoded message names one of {@link LOG_LEVELS}.
 * Matching is exact; `INFO` is not a level.
 */
export function isLogLevel(value: unknown): value is LogLevel {
    return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value);
}

/**
 * Whether `level` is at least as severe as `threshold`, so a logger or transport set to
 * `threshold` emits a record at `level`. A level passes its own threshold.
 */
export function isAtLeastLevel(level: LogLevel, threshold: LogLevel): boolean {
    return LOG_LEVELS.indexOf(level) <= LOG_LEVELS.indexOf(threshold);
}
