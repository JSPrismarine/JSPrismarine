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
    /**
     * Starts another isolated cinnabar client and connects it without waiting for the join, for a
     * scenario about a join that may be refused or replaced. Two clients may share a name.
     */
    connectClient: (displayName: string) => Promise<CinnabarClient>;
    /**
     * Starts another isolated cinnabar client without connecting it, so a scenario can connect
     * several at the same moment through {@link ScenarioContext.connect}.
     */
    launchClient: (displayName: string) => Promise<CinnabarClient>;
    /** Connects a client from {@link ScenarioContext.launchClient} to this suite's server. */
    connect: (client: CinnabarClient) => Promise<void>;
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

/**
 * Waits until the world has run `ticks` more ticks.
 *
 * What a scenario means by "give the server a moment" is a number of ticks, not a number of
 * milliseconds: a host that falls behind runs fewer of them in the same wall-clock time, and a
 * fixed sleep then ends before the server has reacted. The client's own frames still pass in real
 * time, so a wait that is the client's to make stays a {@link sleep}.
 *
 * @param server - The server whose clock counts.
 * @param ticks - How many ticks to let pass.
 * @param timeoutMs - Wall-clock budget; a server that never gets there fails the scenario.
 */
export const waitTicks = async (server: JspServer, ticks: number, timeoutMs = 120_000): Promise<void> => {
    const start = await gameTime(server);
    if (!Number.isFinite(start)) throw new Error('the server did not answer `time query gametime`');

    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const now = await gameTime(server);
        if (now - start >= ticks) return;
        if (Date.now() >= deadline)
            throw new Error(`the world ran ${now - start} of ${ticks} ticks in ${timeoutMs} ms`);
        await sleep(50);
    }
};

/**
 * Polls `check` until it holds or the world has run `ticks` more ticks.
 *
 * The budget is the server's to spend, like {@link waitTicks}: a server at one tick a second gets
 * as many ticks to react as one at twenty, where a deadline in milliseconds would fail it after a
 * twentieth of them.
 *
 * @param server - The server whose clock counts.
 * @param ticks - How many ticks `check` may take to hold.
 * @param check - What to wait for; asked again until it returns true.
 * @param timeoutMs - Wall-clock budget; a server that never gets through the ticks fails.
 * @returns Whether `check` held before the ticks ran out.
 */
export const untilTicks = async (
    server: JspServer,
    ticks: number,
    check: () => Promise<boolean>,
    timeoutMs = 120_000
): Promise<boolean> => {
    const start = await gameTime(server);
    if (!Number.isFinite(start)) throw new Error('the server did not answer `time query gametime`');

    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (await check()) return true;
        const now = await gameTime(server);
        if (now - start >= ticks) return false;
        if (Date.now() >= deadline)
            throw new Error(`the world ran ${now - start} of ${ticks} ticks in ${timeoutMs} ms`);
        await sleep(100);
    }
};

/** How many players the server counts as online, from the `list` command. */
export const onlineCount = async (server: Pick<JspServer, 'command' | 'waitForLine'>): Promise<number> => {
    const reply = server.waitForLine(/There are \d+ players online/, 10_000);
    server.command('list');
    return Number(/There are (\d+) players online/.exec(await reply)?.[1]);
};

/**
 * Asks the server once a second until it counts `count` players online.
 *
 * A cinnabar client that quits sends no disconnect, so the server keeps the player of an extra
 * client a scenario closed until its RakNet session times out, ten seconds later. The budget is
 * wall-clock time because that timeout is.
 *
 * @param server - The server to ask.
 * @param count - How many players it should count.
 * @param timeoutMs - How long to keep asking.
 */
export const untilPlayersOnline = async (
    server: Pick<JspServer, 'command' | 'waitForLine'>,
    count: number,
    timeoutMs = 30_000
): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const online = await onlineCount(server);
        if (online === count) return;
        if (Date.now() >= deadline) throw new Error(`the server still counts ${online} players online, not ${count}`);
        await sleep(1_000);
    }
};

/**
 * Teleports the player and waits until the client stands at the spot for a full second.
 *
 * Reaching it is not enough: a client that has not applied the blocks it should stand on yet
 * arrives for a moment and falls on through, and a teleport can be lost. Ask again every five
 * seconds until it stays put.
 *
 * @param context - The server, the client and the player's name.
 * @param at - Where the feet should be.
 * @param timeoutMs - How long to keep trying.
 */
export const standAt = async (
    context: Pick<ScenarioContext, 'server' | 'client' | 'playerName'>,
    at: { x: number; y: number; z: number },
    timeoutMs = 60_000
): Promise<void> => {
    const { server, client, playerName } = context;
    const teleport = () => server.command(`teleport ${playerName} ${at.x} ${at.y} ${at.z}`);
    teleport();

    const deadline = Date.now() + timeoutMs;
    let nextAsk = Date.now() + 5_000;
    let standingSince: number | undefined;
    for (;;) {
        const feet = vec3(await client.state(), 'feet');
        const there = Math.hypot(feet[0] - at.x, feet[1] - at.y, feet[2] - at.z) < 0.3;
        if (!there) standingSince = undefined;
        else standingSince ??= Date.now();
        if (standingSince !== undefined && Date.now() - standingSince >= 1_000) return;
        if (Date.now() >= deadline) {
            throw new Error(`the client never stood at ${at.x}, ${at.y}, ${at.z}; at ${feet.join(', ')}`);
        }
        if (!there && Date.now() >= nextAsk) {
            teleport();
            nextAsk = Date.now() + 5_000;
        }
        await sleep(100);
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

/** Polls for a screen whose name contains `fragment`; returns its full name. */
export const screenContaining = async (client: CinnabarClient, fragment: string): Promise<string> => {
    const deadline = Date.now() + 15_000;
    for (;;) {
        const screens = (await client.state()).screens;
        const found = Array.isArray(screens)
            ? screens.find((screen): screen is string => typeof screen === 'string' && screen.includes(fragment))
            : undefined;
        if (found !== undefined) return found;
        assert.ok(Date.now() < deadline, `no ${fragment} screen appeared; stack: ${JSON.stringify(screens)}`);
        await sleep(250);
    }
};
