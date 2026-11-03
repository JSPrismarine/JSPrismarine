/** Verifies the farming loop a real client drives: till, plant, and hydrate. */
import assert from 'node:assert/strict';
import path from 'node:path';

import { sleep, vec3 } from '../scenario.mts';
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
        await sleep(1_000);
    }
};

export const farmland: Scenario = {
    name: 'farmland',
    description: 'a client tills grass with a hoe, plants seeds, and water moistens the field',
    run: async ({ client, server, playerName, artifacts, log }) => {
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:iron_hoe 1`);
        server.command(`teleport ${playerName} ${STAND.x} ${STAND.y} ${STAND.z}`);

        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        const landed = Date.now() + 10_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            if (Math.hypot(feet[0] - STAND.x, feet[1] - STAND.y, feet[2] - STAND.z) < 1) break;
            assert.ok(Date.now() < landed, `the client never reached the field: ${feet.join(', ')}`);
            await sleep(250);
        }

        // Down at the grass two blocks south, which is where the crosshair stays all scenario.
        await client.input({ look: { yaw: 0, pitch: 46, frames: 0 } });
        await sleep(250);

        await client.input({ press: ['MouseRight'], press_frames: 3 });
        let tilled = await waitForBlock(server, SOIL, 'minecraft:farmland', 3_000);
        if (!/Found the block at/.test(tilled)) {
            log('retrying the till click after the client captured gameplay input');
            await client.input({ press: ['MouseRight'], press_frames: 3 });
            tilled = await waitForBlock(server, SOIL, 'minecraft:farmland', 5_000);
        }
        assert.match(tilled, /Found the block at/, `the hoe tilled the grass into farmland: ${tilled}`);

        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:wheat_seeds 1`);
        await sleep(500);
        await client.input({ press: ['MouseRight'], press_frames: 3 });
        const planted = await waitForBlock(server, { ...SOIL, y: SOIL.y + 1 }, 'minecraft:wheat', 5_000);
        assert.match(planted, /Found the block at/, `the seeds planted wheat on the farmland: ${planted}`);

        // Fresh farmland is dry. Water three blocks away is inside the four-block range, so a
        // random tick moistens it; one block a tick means the full seven can take a while.
        server.command(`setblock ${SOIL.x + 3} ${SOIL.y} ${SOIL.z} minecraft:water`);
        const moist = await waitForBlock(server, SOIL, 'minecraft:farmland ["moisturized_amount"=7]', 180_000);
        assert.match(moist, /Found the block at/, `water within four blocks moistened the farmland: ${moist}`);

        await client.screenshot(path.join(artifacts, 'farmland.png'));
        log('the client tilled, planted, and the field drew moisture from the water');
    }
};
