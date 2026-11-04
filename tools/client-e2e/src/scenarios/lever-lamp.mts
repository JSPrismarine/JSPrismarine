/** Verifies a client flipping a lever powers the redstone lamp beside the block it is attached to. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

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
    run: async ({ client, server, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        // A stone block two ahead with a lever on its player-facing side and a lamp on top.
        server.command(`setblock ${FIXTURE_X} 63 0 minecraft:stone`);
        server.command(`setblock ${FIXTURE_X} 64 2 minecraft:stone`);
        server.command(`setblock ${FIXTURE_X} 65 2 minecraft:redstone_lamp`);
        server.command(`setblock ${FIXTURE_X} 64 1 minecraft:lever ["lever_direction"="north"]`);
        server.command(`teleport ${playerName} ${FIXTURE_X + 0.5} 64 0.5`);

        const deadline = Date.now() + 15_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            if (Math.hypot(feet[0] - (FIXTURE_X + 0.5), feet[1] - 64, feet[2] - 0.5) < 1) break;
            assert.ok(Date.now() < deadline, `client did not arrive at the fixture; still at ${feet.join(', ')}`);
            await sleep(250);
        }

        const unlit = await blockAt(server, FIXTURE_X, 65, 2, 'minecraft:redstone_lamp');
        assert.match(unlit, /Found the block at/, `the lamp starts unlit: ${unlit}`);

        // The lever is one block ahead and level with the player's feet; look down at it.
        await client.input({ look: { yaw: 0, pitch: 40, frames: 0 } });
        /** Clicks the lever until the lamp reads `expected`, since the first click after a teleport can be dropped. */
        const flipUntil = async (expected: string): Promise<string> => {
            let reply = '';
            for (let attempt = 0; attempt < 2; attempt += 1) {
                await client.input({ press: ['MouseRight'], press_frames: 1 });
                await sleep(300);
                await client.input({ release_all: true });
                reply = await waitForLamp(server, expected, 3_000);
                if (/Found the block at/.test(reply)) break;
            }
            return reply;
        };

        const lit = await flipUntil('minecraft:lit_redstone_lamp');
        assert.match(lit, /Found the block at/, `flipping the lever lit the lamp: ${lit}`);

        const out = await flipUntil('minecraft:redstone_lamp');
        assert.match(out, /Found the block at/, `flipping the lever back put the lamp out: ${out}`);
        log('the lever lit the lamp and flipping it back put it out');
    }
};
