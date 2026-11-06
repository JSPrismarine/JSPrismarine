/** Verifies a client flipping a lever powers the redstone lamp beside the block it is attached to. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { lookTo, placeBlockAndWait, standAt, sleep, waitTicks } from '../scenario.mts';

type Context = Parameters<Scenario['run']>[0];

const BLOCK_REPLY = /Found the block at|The block is |That chunk is not loaded/;
const FIXTURE_X = 64;

/** Reads one block through the server console. */
const blockAt = (server: Context['server'], x: number, y: number, z: number, expected: string): Promise<string> => {
    const reply = server.waitForLine(BLOCK_REPLY, 10_000);
    server.command(`testforblock ${x} ${y} ${z} ${expected}`);
    return reply;
};

/** Polls until the block at the lamp position matches, returning the last reply. */
const waitForLamp = async (server: Context['server'], expected: string, timeoutMs: number): Promise<string> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const reply = await blockAt(server, FIXTURE_X, 65, 2, expected);
        if (/Found the block at/.test(reply) || Date.now() > deadline) return reply;
        await sleep(250);
    }
};

export const leverLamp: Scenario = {
    name: 'lever-lamp',
    description: 'flipping a lever lights the redstone lamp on its block, and flipping it back puts it out',
    run: async (context) => {
        const { client, server, playerName, log } = context;
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        // The fixture is four chunks from the spawn, and `setblock` into a chunk the server has
        // not loaded is dropped. Stand there first so the chunks load, then build. Nothing holds
        // the player up meanwhile, and a survival player falls to their death and cannot click.
        server.command(`gamemode creative ${playerName}`);
        server.command(`teleport ${playerName} ${FIXTURE_X + 0.5} 64 0.5`);
        await waitTicks(server, 40);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
        // A stone block two ahead with a lever on its player-facing side and a lamp on top.
        await placeBlockAndWait(server, { x: FIXTURE_X, y: 63, z: 0 }, 'minecraft:stone');
        await placeBlockAndWait(server, { x: FIXTURE_X, y: 64, z: 2 }, 'minecraft:stone');
        await placeBlockAndWait(server, { x: FIXTURE_X, y: 65, z: 2 }, 'minecraft:redstone_lamp');
        server.command(`setblock ${FIXTURE_X} 64 1 minecraft:lever ["lever_direction"="north"]`);
        await standAt(context, { x: FIXTURE_X + 0.5, y: 64, z: 0.5 });
        server.command(`gamemode survival ${playerName}`);

        const unlit = await blockAt(server, FIXTURE_X, 65, 2, 'minecraft:redstone_lamp');
        assert.match(unlit, /Found the block at/, `the lamp starts unlit: ${unlit}`);

        // The lever is one block ahead and level with the player's feet; look down at it.
        await lookTo(client, 0, 40);
        /**
         * Clicks the lever once and waits for the lamp to read `expected`. A second click would flip
         * the lever back if the first was only slow, so a click that does not land fails the scenario.
         */
        const flipUntil = async (expected: string): Promise<string> => {
            await client.input({ press: ['MouseRight'], press_frames: 3 });
            await client.waitFrames(10);
            await client.input({ release_all: true });
            return waitForLamp(server, expected, 20_000);
        };

        const lit = await flipUntil('minecraft:lit_redstone_lamp');
        assert.match(lit, /Found the block at/, `flipping the lever lit the lamp: ${lit}`);

        const out = await flipUntil('minecraft:redstone_lamp');
        assert.match(out, /Found the block at/, `flipping the lever back put the lamp out: ${out}`);
        log('the lever lit the lamp and flipping it back put it out');
    }
};
