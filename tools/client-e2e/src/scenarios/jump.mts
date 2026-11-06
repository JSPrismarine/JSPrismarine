/** Verifies a client jump lifts the player off the ground and the server lets them land again. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

export const jump: Scenario = {
    name: 'jump',
    description: 'holding jump raises the player about a block, then they land back on the floor',
    run: async ({ client, log }) => {
        const ground = vec3(await client.state(), 'feet')[1];

        // Measured in the client's frames, not seconds: a loaded client draws fewer of them in 1.5 s,
        // and a hold it lost at the start would otherwise read as a jump that never happened.
        const frames = async (): Promise<number> => Number((await client.state()).frame_count);
        await client.input({ jump: true });
        let peak = ground;
        const start = await frames();
        const deadline = Date.now() + 30_000;
        for (let reasserted = false; Date.now() < deadline;) {
            const feet = vec3(await client.state(), 'feet')[1];
            peak = Math.max(peak, feet);
            const elapsed = (await frames()) - start;
            if (elapsed >= 90) break;
            if (!reasserted && elapsed >= 20 && peak - ground < 0.05) {
                await client.input({ jump: true });
                reasserted = true;
            }
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
