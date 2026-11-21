/**
 * The globals a pack's scripts have beside `@minecraft/server`'s exports, which its typings leave
 * out. The script runtime gives them to every pack, on JSPrismarine and on Bedrock Dedicated
 * Server.
 */

/** Writes to the content log, at the level each method names. */
declare const console: {
    log(...data: unknown[]): void;
    info(...data: unknown[]): void;
    warn(...data: unknown[]): void;
    error(...data: unknown[]): void;
};
