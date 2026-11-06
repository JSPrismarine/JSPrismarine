/** Verifies a client right click places the selected hotbar block, and slot changes pick the block. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3, waitTicks } from '../scenario.mts';

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

        /** Right clicks with `slot` selected until `block` stands on the target, since the first click after a reset can be dropped. */
        const placeUntil = async (slot: number, block: string): Promise<string> => {
            await client.input({ hotbar: slot });
            await waitTicks(server, 6);
            let reply = '';
            for (let attempt = 0; attempt < 3; attempt += 1) {
                await client.input({ press: ['MouseRight'], press_frames: 1 });
                await sleep(100);
                await client.input({ release: ['MouseRight'] });
                await waitTicks(server, 8);
                reply = await blockAt(server, FIXTURE_X, 65, 2, block);
                if (/Found the block at/.test(reply)) break;
            }
            return reply;
        };

        const cobble = await placeUntil(2, 'minecraft:cobblestone');
        assert.match(cobble, /Found the block at/, `hotbar slot 2 should have placed cobblestone: ${cobble}`);

        // A click that auto-repeats leaves a second block against the first; clear both so the
        // next ray lands on the stone again.
        await client.input({ release_all: true });
        await waitTicks(server, 10);
        server.command(`fill ${FIXTURE_X} 65 1 ${FIXTURE_X} 65 2 minecraft:air`);
        await waitTicks(server, 6);
        const dirt = await placeUntil(1, 'minecraft:dirt');
        assert.match(dirt, /Found the block at/, `hotbar slot 1 should have placed dirt: ${dirt}`);

        log('right click placed the block from the selected hotbar slot');
    }
};
