/** Verifies the join put a live, healthy player into a loaded world, with a frame to prove it. */
import assert from 'node:assert/strict';
import path from 'node:path';

import type { Scenario } from '../scenario.mts';

export const spawn: Scenario = {
    name: 'spawn',
    description: 'the client is in the world, sees loaded chunks, and renders a frame',
    run: async ({ client, artifacts, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);
        const state = await client.state();

        assert.equal(state.in_world, true, 'client reports in_world');
        const chunks = state.chunks;
        assert.ok(typeof chunks === 'object' && chunks !== null, 'state.chunks present');
        const loaded = (chunks as Record<string, unknown>).loaded_columns;
        assert.ok(typeof loaded === 'number' && loaded > 0, `loaded chunk columns (${String(loaded)}) > 0`);
        const health = state.health;
        assert.ok(typeof health === 'object' && health !== null, 'state.health present');
        const current = (health as Record<string, unknown>).current;
        assert.ok(typeof current === 'number' && current > 0, `health (${JSON.stringify(health)}) > 0`);

        const frame = path.join(artifacts, 'spawn.png');
        await client.screenshot(frame);
        log(`spawned with ${loaded} chunk columns loaded; frame at ${frame}`);
    }
};
