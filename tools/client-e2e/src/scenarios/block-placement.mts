/** Verifies a client right click places the selected hotbar block, and slot changes pick the block. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

type Context = Parameters<Scenario['run']>[0];

const BLOCK_REPLY = /Found the block at|The block is |That chunk is not loaded/;
const FIXTURE_X = 48;

/** Reads one block through the server console. */
const blockAt = (server: Context['server'], x: number, y: number, z: number, expected: string): Promise<string> => {
    const reply = server.waitForLine(BLOCK_REPLY, 10_000);
    server.command(`testforblock ${x} ${y} ${z} ${expected}`);
    return reply;
};

export const blockPlacement: Scenario = {
    name: 'block-placement',
    description: 'right click places the block in the selected hotbar slot on the targeted face',
    run: async ({ client, server, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        server.command(`setblock ${FIXTURE_X} 63 0 minecraft:stone`);
        server.command(`setblock ${FIXTURE_X} 64 2 minecraft:stone`);
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:dirt 4`);
        server.command(`replaceitem entity ${playerName} slot.hotbar 1 minecraft:cobblestone 4`);
        server.command(`teleport ${playerName} ${FIXTURE_X + 0.5} 64 0.5`);

        const deadline = Date.now() + 15_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            if (Math.hypot(feet[0] - (FIXTURE_X + 0.5), feet[1] - 64, feet[2] - 0.5) < 1) break;
            assert.ok(Date.now() < deadline, `client did not arrive at the fixture; still at ${feet.join(', ')}`);
            await sleep(250);
        }
        await client.input({ look: { yaw: 0, pitch: 21, frames: 0 } });

        const place = async (slot: number): Promise<void> => {
            await client.input({ hotbar: slot });
            await sleep(300);
            await client.input({ press: ['MouseRight'], press_frames: 3 });
            await sleep(100);
            await client.input({ release: ['MouseRight'] });
            await sleep(400);
        };

        await place(2);
        const cobble = await blockAt(server, FIXTURE_X, 65, 2, 'minecraft:cobblestone');
        assert.match(cobble, /Found the block at/, `hotbar slot 2 should have placed cobblestone: ${cobble}`);

        server.command(`setblock ${FIXTURE_X} 65 2 minecraft:air`);
        await sleep(300);
        await place(1);
        const dirt = await blockAt(server, FIXTURE_X, 65, 2, 'minecraft:dirt');
        assert.match(dirt, /Found the block at/, `hotbar slot 1 should have placed dirt: ${dirt}`);

        log('right click placed the block from the selected hotbar slot');
    }
};
