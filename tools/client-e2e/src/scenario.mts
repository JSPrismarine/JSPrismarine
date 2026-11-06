/** The scenario contract: a named check run against a live server and an in-world client. */
import assert from 'node:assert/strict';

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

/** Matches every reply `testforblock` gives, whether or not the block is there. */
const BLOCK_CHECK_REPLY = /Found the block at|The block is |The \w+ state does not match|That chunk is not loaded/;

/** Asks the server whether `block` stands at the position, returning its raw reply. */
export const testForBlock = (server: JspServer, at: { x: number; y: number; z: number }, block: string) => {
    const reply = server.waitForLine(BLOCK_CHECK_REPLY, 10_000);
    server.command(`testforblock ${at.x} ${at.y} ${at.z} ${block}`);
    return reply;
};

/**
 * Sets a block and waits until the server reports it there, retrying while its chunk is unloaded.
 *
 * `setblock` into a chunk the server has not loaded is dropped, and the client only loads the
 * chunks around where it stands, so a scenario that builds far from the spawn cannot assume the
 * first command lands.
 */
export const placeBlockAndWait = async (
    server: JspServer,
    at: { x: number; y: number; z: number },
    block: string,
    timeoutMs = 20_000
): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        server.command(`setblock ${at.x} ${at.y} ${at.z} ${block}`);
        const reply = await testForBlock(server, at, block);
        if (/Found the block at/.test(reply)) return;
        if (Date.now() > deadline) throw new Error(`${block} never appeared at ${at.x} ${at.y} ${at.z}: ${reply}`);
        await sleep(250);
    }
};

/**
 * Turns the client and waits until it reports the new heading.
 *
 * The look input is applied over the client's next frames, so a click or a walk issued right
 * after it can still use the old aim. A slow runner makes that gap long enough to matter.
 */
export const lookTo = async (client: CinnabarClient, yaw: number, pitch: number): Promise<void> => {
    await client.input({ look: { yaw, pitch, frames: 0 } });
    const deadline = Date.now() + 10_000;
    for (;;) {
        const rotation = (await client.state()).rotation;
        const observedYaw =
            typeof rotation === 'object' && rotation !== null && 'yaw' in rotation ? rotation.yaw : undefined;
        const observedPitch =
            typeof rotation === 'object' && rotation !== null && 'pitch' in rotation ? rotation.pitch : undefined;
        if (typeof observedYaw === 'number' && typeof observedPitch === 'number') {
            // Yaw wraps, so compare the shortest way around.
            const yawGap = Math.abs(((((observedYaw - yaw) % 360) + 540) % 360) - 180);
            if (yawGap < 0.5 && Math.abs(observedPitch - pitch) < 0.5) return;
        }
        assert.ok(
            Date.now() < deadline,
            `client never looked to yaw ${yaw} pitch ${pitch}; at ${JSON.stringify(rotation)}`
        );
        await sleep(100);
    }
};
