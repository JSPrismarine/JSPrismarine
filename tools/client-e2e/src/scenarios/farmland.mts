/** Verifies the farming loop a real client drives: till, plant, and hydrate. */
import assert from 'node:assert/strict';
import path from 'node:path';

import { advanceTicks, lookTo, waitTicks, standAt } from '../scenario.mts';
import type { Scenario } from '../scenario.mts';

/** Where the player stands; the tilled block is two south of it, on the flat world's surface. */
const STAND = { x: 20.5, y: -60, z: 20.5 };
const SOIL = { x: 20, y: -61, z: 22 };

const BLOCK_REPLY = /Found the block at|The block is |The \w+ state does not match|That chunk is not loaded/;

/** Asks the server what stands at a position, with any state list the check needs. */
const blockReply = async (
    server: Parameters<Scenario['run']>[0]['server'],
    at: { x: number; y: number; z: number },
    block: string
): Promise<string> => {
    const reply = server.waitForLine(BLOCK_REPLY, 10_000);
    server.command(`testforblock ${at.x} ${at.y} ${at.z} ${block}`);
    return reply;
};

/** Polls a block check until it matches or the deadline passes. */
const waitForBlock = async (
    server: Parameters<Scenario['run']>[0]['server'],
    at: { x: number; y: number; z: number },
    block: string,
    timeoutMs: number
): Promise<string> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const reply = await blockReply(server, at, block);
        if (/Found the block at/.test(reply)) return reply;
        if (Date.now() > deadline) return reply;
        await waitTicks(server, 20);
    }
};

export const farmland: Scenario = {
    name: 'farmland',
    description: 'a client tills grass with a hoe, plants seeds, and water moistens the field',
    run: async (context) => {
        const { client, server, playerName, artifacts, log } = context;
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:iron_hoe 1`);
        await standAt(context, STAND);

        // Down at the grass two blocks south, which is where the crosshair stays all scenario.
        await lookTo(client, 0, 46);
        // The client keeps the slot an earlier scenario selected, so ask for the hoe's slot.
        await client.input({ hotbar: 1 });
        await waitTicks(server, 5);

        // A click can be lost on a starved host, and the block never changes, so the click is
        // repeated until the server shows the result: tilling farmland again, or planting where
        // wheat already stands, changes nothing.
        const clickUntil = async (at: typeof SOIL, block: string): Promise<string> => {
            let reply = '';
            for (let attempt = 1; attempt <= 6; attempt++) {
                await client.input({ press: ['MouseRight'], press_frames: 3 });
                await client.input({ release_all: true });
                reply = await waitForBlock(server, at, block, 5_000);
                if (/Found the block at/.test(reply)) return reply;
                log(`the click did not land (attempt ${attempt}): ${reply}`);
            }
            return reply;
        };

        const tilled = await clickUntil(SOIL, 'minecraft:farmland');
        assert.match(tilled, /Found the block at/, `the hoe tilled the grass into farmland: ${tilled}`);

        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:wheat_seeds 1`);
        await waitTicks(server, 10);
        const planted = await clickUntil({ ...SOIL, y: SOIL.y + 1 }, 'minecraft:wheat');
        assert.match(planted, /Found the block at/, `the seeds planted wheat on the farmland: ${planted}`);

        // Fresh farmland is dry. Water three blocks away is inside the four-block range, so one
        // random tick moistens it. At the default speed a block waits minutes for that tick and
        // the check fails by chance, so speed the ticks up for the wait and restore them after.
        server.command('gamerule random_tick_speed 100');
        try {
            server.command(`setblock ${SOIL.x + 3} ${SOIL.y} ${SOIL.z} minecraft:water`);
            // Ticks, not seconds: a starved host runs fewer of them in a minute, and the random tick
            // this waits for is a matter of how many the world has had.
            await advanceTicks(server, 400);
            const moist = await waitForBlock(server, SOIL, 'minecraft:farmland ["moisturized_amount"=7]', 10_000);
            assert.match(moist, /Found the block at/, `water within four blocks moistened the farmland: ${moist}`);
        } finally {
            server.command('gamerule random_tick_speed 3');
        }

        await client.screenshot(path.join(artifacts, 'farmland.png'));
        log('the client tilled, planted, and the field drew moisture from the water');
    }
};
