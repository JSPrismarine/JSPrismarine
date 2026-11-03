/** Verifies a rendering Bedrock client completes chunk loads from request-mode responses. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';

export const subChunkRequestDelivery: Scenario = {
    name: 'subchunk-request-delivery',
    description: 'the client loads request-mode LevelChunk skeletons and SubChunkPacket responses',
    run: async ({ client, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);

        const state = await client.state();
        assert.equal(state.in_world, true, 'client reports in_world after request-mode chunk delivery');
        const chunks = state.chunks;
        if (typeof chunks !== 'object' || chunks === null || !('loaded_columns' in chunks)) {
            throw new Error('state.chunks.loaded_columns is missing');
        }
        const loadedColumns = chunks.loaded_columns;
        assert.ok(
            typeof loadedColumns === 'number' && loadedColumns >= 25,
            `radius-2 chunks loaded through subchunk requests (${String(loadedColumns)})`
        );

        log(`request-mode chunk delivery loaded ${loadedColumns} chunk columns`);
    }
};
