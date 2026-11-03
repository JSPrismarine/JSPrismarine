import { channel } from 'node:diagnostics_channel';
import { performance } from 'node:perf_hooks';

/** A startup phase and the time spent in it. */
export interface StartupPhaseMeasurement {
    /** The startup step measured. */
    readonly phase: 'content-build' | 'command-build' | 'world-manager-enable';
    /** Wall time spent in the step, in milliseconds. */
    readonly durationMs: number;
}

const startupPhaseChannel = channel('jsprismarine.server.startup-phase');

/**
 * Starts a phase timer only when a benchmark or diagnostic observer is listening.
 * @returns The timer start in milliseconds, or undefined without an observer.
 */
export const startStartupPhase = (): number | undefined =>
    startupPhaseChannel.hasSubscribers ? performance.now() : undefined;

/**
 * Reports one measured phase when an observer subscribed before server startup.
 * @param phase - The server startup step that finished.
 * @param startedAt - The time returned by {@link startStartupPhase}, or undefined without an observer.
 */
export const finishStartupPhase = (phase: StartupPhaseMeasurement['phase'], startedAt: number | undefined): void => {
    if (startedAt === undefined) return;
    try {
        startupPhaseChannel.publish({
            phase,
            durationMs: performance.now() - startedAt
        } satisfies StartupPhaseMeasurement);
    } catch {
        // Benchmark observers must not make the server fail during startup.
    }
};
