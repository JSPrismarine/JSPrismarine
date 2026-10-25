/** Whether `warning` is the `ExperimentalWarning` Node emits when `node:ffi` is first loaded. */
export const isFfiExperimentalWarning = (warning: Error): boolean =>
    warning.name === 'ExperimentalWarning' && /\bFFI\b/.test(warning.message);

/** The part of `process` the filter needs; `EventEmitter` fits, so tests pass one in. */
export interface WarningSource {
    listeners(event: 'warning'): Array<(warning: Error) => void>;
    removeAllListeners(event: 'warning'): unknown;
    on(event: 'warning', listener: (warning: Error) => void): unknown;
}

/**
 * Keeps Node's `FFI is an experimental feature` warning off the terminal. The TUI gate loads
 * `node:ffi` to see whether the renderer can run, and the warning Node prints for that stays
 * in the user's scrollback after the TUI exits. Node's default printer is an ordinary
 * `'warning'` listener, so a filter alone would not silence it: this takes over every listener
 * registered so far and forwards all other warnings to them unchanged.
 */
export const suppressFfiWarning = (source: WarningSource = process): void => {
    const previous = source.listeners('warning');
    source.removeAllListeners('warning');
    source.on('warning', (warning) => {
        if (isFfiExperimentalWarning(warning)) return;
        for (const listener of previous) listener(warning);
    });
};
