/** Verifies a client jump lifts the player off the ground and the server lets them land again. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

export const jump: Scenario = {
    name: 'jump',
    description: 'holding jump raises the player about a block, then they land back on the floor',
    run: async ({ client, log }) => {
        const ground = vec3(await client.state(), 'feet')[1];

        await client.input({ jump: true });
        let peak = ground;
        const deadline = Date.now() + 1_500;
        while (Date.now() < deadline) {
            peak = Math.max(peak, vec3(await client.state(), 'feet')[1]);
            await sleep(25);
        }
        await client.input({ jump: false, release_all: true });

        assert.ok(peak - ground > 0.8, `jump peaked ${(peak - ground).toFixed(2)} blocks above ${ground}`);
        assert.ok(peak - ground < 1.6, `jump peaked ${(peak - ground).toFixed(2)} blocks, more than a jump allows`);

        await sleep(1_000);
        const landed = vec3(await client.state(), 'feet')[1];
        assert.ok(Math.abs(landed - ground) < 0.1, `player landed at ${landed}, expected ${ground}`);
        log(`jumped ${(peak - ground).toFixed(2)} blocks and landed at ${landed}`);
    }
};
