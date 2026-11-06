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
        // Until the distance is covered rather than for a fixed three seconds: a loaded client
        // simulates fewer frames in them, and walking is what this scenario is about, not its speed.
        const deadline = Date.now() + 15_000;
        let after = before;
        while (Math.hypot(after[0] - before[0], after[2] - before[2]) <= 1 && Date.now() < deadline) {
            await sleep(250);
            after = vec3(await client.state(), 'feet');
        }
        await client.input({ move: { forward: 0 }, release_all: true });

        const traveled = Math.hypot(after[0] - before[0], after[2] - before[2]);
        assert.ok(
            traveled > 1,
            `player traveled ${traveled.toFixed(2)} blocks; expected more than 1 ` +
                `(from ${before.join(', ')} to ${after.join(', ')})`
        );
        log(`walked ${traveled.toFixed(2)} blocks`);
    }
};
