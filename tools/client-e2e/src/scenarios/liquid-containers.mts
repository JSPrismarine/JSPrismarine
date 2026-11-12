/** Verifies liquid scooping charges the authoritative empty container. */
import assert from 'node:assert/strict';

import { lookTo, sleep, standAt, waitTicks } from '../scenario.mts';
import type { Scenario } from '../scenario.mts';

export const liquidContainers: Scenario = {
    name: 'liquid-containers',
    description: 'filling buckets and bottles spends one empty container in survival',
    run: async ({ client, server, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        for (const [liquid, container] of [
            ['water', 'bucket'],
            ['lava', 'bucket'],
            ['water', 'glass_bottle']
        ]) {
            server.command(`setblock 32 63 0 minecraft:stone`);
            server.command(`setblock 32 63 2 minecraft:stone`);
            server.command(`setblock 32 64 2 minecraft:${liquid}`);
            server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:${container} 2`);
            await standAt({ client, server, playerName }, { x: 32.5, y: 64, z: 0.5 });
            await client.input({ hotbar: 1 });
            await lookTo(client, 0, 30);
            await sleep(500);
            await client.input({ press: ['MouseRight'], press_frames: 1 });
            await sleep(100);
            await client.input({ release: ['MouseRight'] });
            await waitTicks(server, 10);
            const counted = server.waitForLine(/Found \d+ matching/, 10_000);
            server.command(`clear ${playerName} minecraft:${container} 0`);
            assert.match(await counted, /Found 1 matching/, `${liquid} scoop must spend one ${container}`);
            log(`${liquid} scoop spent one ${container}`);
            server.command(`clear ${playerName}`);
            server.command('setblock 32 64 2 minecraft:air');
        }
    }
};
