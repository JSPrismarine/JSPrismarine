/** Verifies a block update across the negative-to-zero chunk edge reaches the real client. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3 } from '../scenario.mts';

/** Counts item actors visible to the client. */
const itemActorCount = (state: Record<string, unknown>): number => {
    const actors = state.actors;
    assert.ok(Array.isArray(actors), 'state.actors is an array');

    return actors.filter(
        (actor) => typeof actor === 'object' && actor !== null && 'type' in actor && actor.type === 'minecraft:item'
    ).length;
};

export const edgeChunkBlockChange: Scenario = {
    name: 'edge-chunk-block-change',
    description: 'a block update across the -1/0 chunk edge reaches the client',
    run: async ({ server, client, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);
        server.command(`teleport ${playerName} -0.5 64 -0.5`);

        const deadline = Date.now() + 15_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            if (Math.hypot(feet[0] + 0.5, feet[1] - 64, feet[2] + 0.5) < 1) break;
            assert.ok(Date.now() < deadline, `client did not reach the negative chunk edge; at ${feet.join(', ')}`);
            await sleep(250);
        }

        // The client stands in chunk z=-1 and receives the update for chunk z=0.
        server.command('setblock -1 64 0 minecraft:stone');
        server.command('setblock -1 65 0 minecraft:dirt');
        await sleep(500);
        await client.input({ look: { yaw: 0, pitch: 0, frames: 0 } });
        const before = itemActorCount(await client.state());
        await client.input({ hold: ['key.attack'] });
        await sleep(1_250);
        await client.input({ release_all: true });

        let after = itemActorCount(await client.state());
        for (let attempt = 0; after <= before && attempt < 20; attempt += 1) {
            await sleep(250);
            after = itemActorCount(await client.state());
        }

        assert.ok(after > before, `breaking the updated edge block exposed ${after - before} item actors`);
        log('the client broke the block at z=0, across the -1/0 chunk edge, and saw its drop');
    }
};
