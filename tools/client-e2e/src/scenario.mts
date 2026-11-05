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
        /** Starts the pinned normal Overworld at seed 1234 for the climate-spawn scenario. */
        worldgenSpawn?: boolean;
    };
    run: (context: ScenarioContext) => Promise<void>;
}

/** Waits for `ms` of wall-clock time; both the server and the client keep simulating. */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** The world's game time in ticks, which is what `time query gametime` answers. */
export const gameTime = async (server: JspServer): Promise<number> => {
    const reply = server.waitForLine(/The time is \d+/, 10_000);
    server.command('time query gametime');
    return Number(/The time is (\d+)/.exec(await reply)?.[1]);
};

/**
 * Lets the world run exactly `ticks` ticks, however long the machine takes to run them.
 *
 * Anything chance decides - a natural spawn, a random tick - is a function of the world's seed
 * and the number of ticks that have passed, so a scenario that counts ticks gets the same
 * outcome on every run, where one that sleeps for wall-clock seconds gets however many ticks a
 * loaded runner happened to fit in them. The server sprints, running the ticks back to back
 * rather than at 20 a second.
 *
 * @param server - The server whose world advances.
 * @param ticks - How many ticks to let through.
 * @param timeoutMs - Wall-clock budget for the sprint; a world that cannot finish it fails.
 */
export const advanceTicks = async (server: JspServer, ticks: number, timeoutMs = 120_000): Promise<void> => {
    const start = await gameTime(server);
    if (!Number.isFinite(start)) throw new Error('the server did not answer `time query gametime`');
    server.command(`tick sprint ${ticks}`);

    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const now = await gameTime(server);
        if (now - start >= ticks) return;
        if (Date.now() >= deadline)
            throw new Error(`the world ran ${now - start} of ${ticks} ticks in ${timeoutMs} ms`);
        await sleep(200);
    }
};

/** Reads `[x, y, z]` out of a state snapshot key such as `feet` or `server_position`. */
export const vec3 = (state: Record<string, unknown>, key: string): [number, number, number] => {
    const value = state[key];
    if (!Array.isArray(value) || value.length !== 3 || !value.every((axis) => typeof axis === 'number')) {
        throw new Error(`state.${key} is not a 3-vector: ${JSON.stringify(value)}`);
    }
    return value as [number, number, number];
};
