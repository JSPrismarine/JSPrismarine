/** Confirms a real client joins inside Java's climate-selected Overworld spawn chunk. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { vec3 } from '../scenario.mts';

export const worldgenSpawn: Scenario = {
    name: 'worldgen-spawn',
    description: 'the client joins in Java seed 1234 climate-selected spawn chunk (-33, 4)',
    serverOptions: { worldgenSpawn: true },
    run: async ({ client, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 180_000);
        const state = await client.state();
        const feet = vec3(state, 'feet');
        const chunk = [Math.floor(feet[0]) >> 4, Math.floor(feet[2]) >> 4];

        // The Java 26.3 vector in packages/worldgen/vectors/spawn.json selects (-33, 4).
        assert.deepEqual(chunk, [-33, 4], `client feet ${feet.join(', ')} are in chunk ${chunk.join(', ')}`);
        assert.equal(state.in_world, true, 'client reports in_world');
        log(`joined at ${feet.join(', ')} in Java-selected chunk ${chunk.join(', ')}`);
    }
};
