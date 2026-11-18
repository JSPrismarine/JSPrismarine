/**
 * Verifies each mined block's item reaches the client before the next block is mined, and lies in
 * the open rather than inside the block above it.
 */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { lookTo, sleep, vec3 } from '../scenario.mts';

/** The item actors visible to the client. */
const itemActors = (state: Record<string, unknown>): Record<string, unknown>[] => {
    const actors = state.actors;
    assert.ok(Array.isArray(actors), 'state.actors is an array');

    return actors.filter(
        (actor): actor is Record<string, unknown> =>
            typeof actor === 'object' && actor !== null && 'type' in actor && actor.type === 'minecraft:item'
    );
};

/** Counts item actors visible to the client. */
const itemActorCount = (state: Record<string, unknown>): number => itemActors(state).length;

/** Checks each break on the live client before sending another mining action. */
export const miningDrops: Scenario = {
    name: 'mining-drops',
    description: 'each mined block drops an item, below the block over it, before the following block is mined',
    run: async ({ server, client, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);
        const feet = vec3(await client.state(), 'feet');
        const x = Math.floor(feet[0]);
        const y = Math.floor(feet[1]) + 1;
        const z = Math.floor(feet[2]) + 3;

        await lookTo(client, 0, 0);

        for (const block of ['minecraft:dirt', 'minecraft:sand', 'minecraft:gravel']) {
            // The last block's drop lies within reach and is picked up some time after it lands, which
            // on a loaded host can be mid-way through this block's break and cancel out its new drop.
            // Start from a world with no drops and wait until the client agrees.
            server.command('kill @e[type=item]');
            const cleared = Date.now() + 20_000;
            while (itemActorCount(await client.state()) > 0) {
                assert.ok(Date.now() < cleared, 'the client kept drawing item actors after they were killed');
                await sleep(100);
            }
            const previousDrops = 0;
            server.command(`setblock ${x} ${y - 1} ${z} minecraft:stone`);
            // A ceiling, as in a tunnel or a vein: the drop pops upward into it, and used to be put
            // on top of it, out of sight inside the wall until that block was mined too.
            server.command(`setblock ${x} ${y + 1} ${z} minecraft:stone`);
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

            // Long enough for the upward pop to meet the ceiling and the drop to fall back.
            await sleep(1_000);
            for (const drop of itemActors(await client.state())) {
                const [, dropY] = vec3(drop, 'position');
                assert.ok(dropY < y + 1, `the ${block} drop is at y ${dropY}, inside the ceiling at ${y + 1}`);
            }
        }

        // Take the ceiling down, so the scenarios after this one find open air over the floor.
        server.command(`setblock ${x} ${y + 1} ${z} minecraft:air`);
        log('each block produced a visible item before the next break');
    }
};
