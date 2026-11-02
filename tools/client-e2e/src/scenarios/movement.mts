/** Verifies client input moves the player: walk forward, then confirm the feet traveled. */
import assert from 'node:assert/strict';
import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

export const movement: Scenario = {
    name: 'movement',
    description: 'holding forward moves the simulated player across the flat world',
    run: async ({ client, log }) => {
        const before = vec3(await client.state(), 'feet');
        await client.input({ move: { forward: 1 } });
        await sleep(3000);
        await client.input({ move: { forward: 0 }, release_all: true });
        const after = vec3(await client.state(), 'feet');

        const traveled = Math.hypot(after[0] - before[0], after[2] - before[2]);
        assert.ok(
            traveled > 1,
            `player traveled ${traveled.toFixed(2)} blocks; expected more than 1 ` +
                `(from ${before.join(', ')} to ${after.join(', ')})`
        );
        log(`walked ${traveled.toFixed(2)} blocks`);
    }
};
