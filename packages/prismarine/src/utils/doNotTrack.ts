import type { Environment } from './isTestRunner';

/**
 * The environment variable that asks every part of the server not to send telemetry. The docs
 * quote it.
 */
export const DO_NOT_TRACK_VARIABLE = 'DO_NOT_TRACK';

/** The convention's explicit opt-in: any other value asks not to track. */
export const DO_NOT_TRACK_OPT_IN = '0';

/**
 * Whether telemetry must stay off on this start. The Do Not Track convention gives `1` as the
 * opt-out and `0` as the opt-in; any other value is not a defined preference, so it opts out too,
 * rather than tracking someone who asked not to be tracked. Every telemetry surface checks this
 * before it sends anything, so the one variable governs them all, including surfaces added later.
 * @param env - The environment to read. The process's own by default.
 */
export const isDoNotTrack = (env: Environment = process.env): boolean => {
    const value = env[DO_NOT_TRACK_VARIABLE];
    return value !== undefined && value !== DO_NOT_TRACK_OPT_IN;
};
