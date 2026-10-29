/**
 * The minimal logging surface the kernel needs.
 *
 * `@jsprismarine/logger`'s `Logger` satisfies this structurally; the kernel does
 * not depend on it so that hosts and tests can supply any implementation.
 */
export interface KernelLogger {
    /** Logs diagnostic detail. */
    debug(message: string): void;
    /** Logs routine lifecycle information. */
    info(message: string): void;
    /** Logs a recoverable problem. */
    warn(message: string): void;
    /** Logs a failure. */
    error(message: string): void;
}

/**
 * The default kernel logger, backed by the global console.
 */
export const consoleLogger: KernelLogger = {
    debug: (message) => console.debug(message),
    // The repository lint reserves console.info/log for debugging; route
    // routine kernel messages through console.debug as well.
    info: (message) => console.debug(message),
    warn: (message) => console.warn(message),
    error: (message) => console.error(message)
};

/**
 * Wraps a logger so every message is prefixed with a scope, e.g. a module id.
 */
export function scopedLogger(base: KernelLogger, scope: string): KernelLogger {
    const prefix = `[${scope}] `;
    return {
        debug: (message) => base.debug(prefix + message),
        info: (message) => base.info(prefix + message),
        warn: (message) => base.warn(prefix + message),
        error: (message) => base.error(prefix + message)
    };
}
