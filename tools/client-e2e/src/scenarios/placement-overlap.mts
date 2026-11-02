/** Verifies the server refuses a client placement whose collision box overlaps its player. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

const BLOCK_REPLY = /Found the block at|The block is |That chunk is not loaded/;
const PLACEMENT_OFFSET_X = 32;

/** Reads one block through the server console. */
const blockAt = async (
    server: Parameters<Scenario['run']>[0]['server'],
    x: number,
    y: number,
    z: number,
    expected: string
): Promise<string> => {
    const reply = server.waitForLine(BLOCK_REPLY, 10_000);
    server.command(`testforblock ${x} ${y} ${z} ${expected}`);
    return reply;
};

/** Sends one right click and releases the button before the next action. */
const rightClick = async (client: Parameters<Scenario['run']>[0]['client']): Promise<void> => {
    await client.input({ press: ['MouseRight'], press_frames: 3 });
    await sleep(100);
    await client.input({ release: ['MouseRight'] });
    await sleep(300);
};

/** Waits until the client has received the server teleport. */
const waitForFeet = async (
    client: Parameters<Scenario['run']>[0]['client'],
    target: readonly [number, number, number]
): Promise<void> => {
    const deadline = Date.now() + 15_000;
    for (;;) {
        const feet = vec3(await client.state(), 'feet');
        if (Math.hypot(feet[0] - target[0], feet[1] - target[1], feet[2] - target[2]) < 1) return;
        assert.ok(Date.now() < deadline, `client did not reach ${target.join(', ')}; still at ${feet.join(', ')}`);
        await sleep(250);
    }
};

export const placementOverlap: Scenario = {
    name: 'placement-overlap',
    description: 'the server refuses a colliding block placed in the player body',
    run: async ({ client, server, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        server.command(`setblock ${PLACEMENT_OFFSET_X} 63 0 minecraft:stone`);
        server.command(`setblock ${PLACEMENT_OFFSET_X} 64 2 minecraft:stone`);
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:dirt 1`);
        server.command(`teleport ${playerName} ${PLACEMENT_OFFSET_X + 0.5} 64 0.5`);
        const ready = server.waitForLine(/placement-overlap-ready/, 30_000);
        server.command('say placement-overlap-ready');
        await ready;
        await waitForFeet(client, [PLACEMENT_OFFSET_X + 0.5, 64, 0.5]);

        await client.input({ look: { yaw: 0, pitch: 21, frames: 0 } });
        await rightClick(client);
        const control = await blockAt(server, PLACEMENT_OFFSET_X, 65, 2, 'minecraft:dirt');
        assert.match(control, /Found the block at/, `ordinary client placement reached the server: ${control}`);

        const rearmed = server.waitForLine(/placement-overlap-rearmed/, 10_000);
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:dirt 1`);
        server.command('say placement-overlap-rearmed');
        await rearmed;
        await sleep(200);
        await client.input({ look: { yaw: 0, pitch: 85, frames: 0 } });
        await rightClick(client);
        const overlap = await blockAt(server, PLACEMENT_OFFSET_X, 64, 0, 'minecraft:air');
        assert.match(overlap, /Found the block at/, `overlapping placement left the target air: ${overlap}`);

        const heldStack = server.waitForLine(/Removed \d+ items?/, 10_000);
        server.command(`clear ${playerName} minecraft:dirt 64`);
        const cleared = await heldStack;
        assert.match(
            cleared,
            /Removed 1 item/,
            `refused placement kept the dirt in the player's inventory: ${cleared}`
        );

        log('a normal placement succeeded; the self-overlap target stayed air, and the dirt remained in inventory');
    }
};
