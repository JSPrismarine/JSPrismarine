/** Verifies each mined block's item reaches the client before the next block is mined. */
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

/** Checks each break on the live client before sending another mining action. */
export const miningDrops: Scenario = {
    name: 'mining-drops',
    description: 'each mined block drops an item before the following block is mined',
    run: async ({ server, client, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);
        const feet = vec3(await client.state(), 'feet');
        const x = Math.floor(feet[0]);
        const y = Math.floor(feet[1]) + 1;
        const z = Math.floor(feet[2]) + 3;

        await client.input({ look: { yaw: 0, pitch: 0, frames: 0 } });

        for (const block of ['minecraft:dirt', 'minecraft:sand', 'minecraft:gravel']) {
            const previousDrops = itemActorCount(await client.state());
            server.command(`setblock ${x} ${y - 1} ${z} minecraft:stone`);
            server.command(`setblock ${x} ${y} ${z} ${block}`);
            await sleep(250);

            // Hold until the server has broken the block: a bare hand takes longer on gravel than
            // on dirt, and a loaded runner takes longer than either.
            await client.input({ hold: ['key.attack'] });
            const brokeBy = Date.now() + 15_000;
            for (;;) {
                const reply = server.waitForLine(/Found the block at|The block is |That chunk is not loaded/, 10_000);
                server.command(`testforblock ${x} ${y} ${z} minecraft:air`);
                if (/Found the block at/.test(await reply) || Date.now() > brokeBy) break;
                await sleep(250);
            }
            await client.input({ release_all: true });

            let visibleDrops = itemActorCount(await client.state());
            for (let attempt = 0; visibleDrops <= previousDrops && attempt < 20; attempt += 1) {
                await sleep(250);
                visibleDrops = itemActorCount(await client.state());
            }

            assert.ok(
                visibleDrops > previousDrops,
                `mining ${block} produced ${visibleDrops - previousDrops} visible item actors before the next block`
            );
        }

        log('each block produced a visible item before the next break');
    }
};
