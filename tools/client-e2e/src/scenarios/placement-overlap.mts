/** Verifies the server refuses a client placement whose collision box overlaps its player. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { lookTo, sleep, vec3 } from '../scenario.mts';

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
    await client.input({ press: ['MouseRight'], press_frames: 1 });
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

        await lookTo(client, 0, 21);
        await rightClick(client);
        const control = await blockAt(server, PLACEMENT_OFFSET_X, 65, 2, 'minecraft:dirt');
        assert.match(control, /Found the block at/, `ordinary client placement reached the server: ${control}`);

        // A click still held or queued when the dirt comes back would place it against the first
        // block and leave nothing to refuse. Let go of every control, then put the dirt in a
        // different slot from the one the control click emptied and select that slot only now, so
        // a late stray click lands on the empty slot instead of spending the dirt.
        await client.input({ release_all: true });
        await sleep(500);
        const rearmed = server.waitForLine(/placement-overlap-rearmed/, 10_000);
        server.command(`replaceitem entity ${playerName} slot.hotbar 1 minecraft:dirt 1`);
        server.command('say placement-overlap-rearmed');
        await rearmed;
        await sleep(200);
        await client.input({ hotbar: 2 });
        await sleep(300);
        await lookTo(client, 0, 85);
        await rightClick(client);
        // Give the server time to answer the click, so the check below sees its verdict and
        // not the world from before it arrived.
        await sleep(1_000);
        const overlap = await blockAt(server, PLACEMENT_OFFSET_X, 64, 0, 'minecraft:air');
        assert.match(overlap, /Found the block at/, `overlapping placement left the target air: ${overlap}`);

        const heldStack = server.waitForLine(/Removed \d+ items?/, 10_000);
        server.command(`clear ${playerName} minecraft:dirt 64`);
        const cleared = await heldStack;
        if (!/Removed 1 item/.test(cleared)) {
            // The dirt is gone with no refusal in the way: say where it went, because a block
            // of it standing next to the player means a click that was never the overlap.
            const strays: string[] = [];
            for (let dx = -2; dx <= 2; dx += 1) {
                for (let dz = -2; dz <= 4; dz += 1) {
                    for (const y of [64, 65]) {
                        const at = [PLACEMENT_OFFSET_X + dx, y, dz] as const;
                        const reply = await blockAt(server, at[0], at[1], at[2], 'minecraft:dirt');
                        if (/Found the block at/.test(reply)) strays.push(at.join(','));
                    }
                }
            }
            assert.fail(
                `refused placement kept the dirt in the player's inventory: ${cleared}; ` +
                    `dirt blocks near the player: ${strays.join(' ') || 'none'}`
            );
        }

        log('a normal placement succeeded; the self-overlap target stayed air, and the dirt remained in inventory');
    }
};
