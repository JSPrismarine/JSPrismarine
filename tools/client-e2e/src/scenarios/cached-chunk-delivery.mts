/** Measures join readiness when the server delivers resident chunks before generation work. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';

export const cachedChunkDelivery: Scenario = {
    name: 'cached-chunk-delivery',
    description: 'records PlayerSpawn and radius-2 chunk readiness during a real client join',
    serverOptions: { preloadRadius: 2 },
    run: async ({ client, playerSpawnMs, radius2ChunkReadyMs, log }) => {
        if (typeof playerSpawnMs !== 'number' || typeof radius2ChunkReadyMs !== 'number') {
            throw new Error('runner did not measure PlayerSpawn and radius-2 chunk readiness');
        }
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);

        const state = await client.state();
        assert.equal(state.in_world, true, 'client reports in_world after PlayerSpawn');
        const chunks = state.chunks;
        if (typeof chunks !== 'object' || chunks === null || !('loaded_columns' in chunks)) {
            throw new Error('state.chunks.loaded_columns is missing');
        }
        const loadedColumns = chunks.loaded_columns;
        assert.ok(typeof loadedColumns === 'number' && loadedColumns >= 25, `radius-2 chunk columns loaded`);

        const order = playerSpawnMs <= radius2ChunkReadyMs ? 'PlayerSpawn first' : 'radius-2 chunks first';
        log(
            `${order}; PlayerSpawn observed at ${playerSpawnMs.toFixed(1)} ms, ` +
                `radius-2 readiness at ${radius2ChunkReadyMs.toFixed(1)} ms, ${loadedColumns} columns loaded`
        );
    }
};
