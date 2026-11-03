/** The scenario contract: a named check run against a live server and an in-world client. */
import type { CinnabarClient } from './client.mts';
import type { JspServer } from './jsp-server.mts';

/** What a scenario gets to work with: the live pair, plus a directory for its evidence. */
export interface ScenarioContext {
    server: JspServer;
    client: CinnabarClient;
    /** Starts another isolated cinnabar client connected to this suite's server. */
    createClient: (displayName: string) => Promise<CinnabarClient>;
    /** The display name the client joined with, as the server sees it. */
    playerName: string;
    /** Milliseconds from connect until the client first reports that PlayerSpawn completed. */
    playerSpawnMs?: number;
    /** Milliseconds from connect until the client first reports at least 25 loaded columns. */
    radius2ChunkReadyMs?: number;
    /** Directory for this scenario's screenshots and recordings. */
    artifacts: string;
    log: (message: string) => void;
}

/** One e2e check. `run` throws (usually via `node:assert`) to fail the scenario. */
export interface Scenario {
    name: string;
    description: string;
    /** Optional content fixture required by this scenario's disposable server. */
    serverOptions?: {
        /** Add the minimal cow definition and natural spawn rule used by the spawn-placement scenario. */
        naturalCowSpawning?: boolean;
        /** Capture the server timing trace for a readiness or performance scenario. */
        profile?: boolean;
        /** Keep the spawn region resident before the client joins. */
        preloadRadius?: number;
    };
    run: (context: ScenarioContext) => Promise<void>;
}

/** Waits for `ms` of wall-clock time; both the server and the client keep simulating. */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads `[x, y, z]` out of a state snapshot key such as `feet` or `server_position`. */
export const vec3 = (state: Record<string, unknown>, key: string): [number, number, number] => {
    const value = state[key];
    if (!Array.isArray(value) || value.length !== 3 || !value.every((axis) => typeof axis === 'number')) {
        throw new Error(`state.${key} is not a 3-vector: ${JSON.stringify(value)}`);
    }
    return value as [number, number, number];
};
