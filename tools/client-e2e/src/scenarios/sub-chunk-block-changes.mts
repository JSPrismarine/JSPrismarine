/** Verifies the bulk block changes of one sub chunk reach the real client. */
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

/** A spot in the air, clear of the flat surface and of what the other scenarios build. */
const FLOOR = { x: 100, y: 63, z: 100 };

export const subChunkBlockChanges: Scenario = {
    name: 'sub-chunk-block-changes',
    description: 'blocks a single fill changed in one sub chunk reach the client',
    run: async ({ server, client, playerName, log }) => {
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);

        const { x, y, z } = FLOOR;
        const standX = x + 1.5;
        const standZ = z + 1.5;
        // The platform is far from where the client joined. Go there first and let its chunks
        // arrive, or the client falls through ground it has not been sent yet and the fill lands
        // in a chunk it has not loaded.
        server.command(`teleport ${playerName} ${standX} ${y + 1} ${standZ}`);
        await sleep(2_000);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);

        // Something to stand on, then a wall in front of it. Each is one fill, so its blocks
        // share a sub chunk and travel as one `UpdateSubChunkBlocksPacket` rather than as one
        // `UpdateBlockPacket` each.
        server.command(`fill ${x} ${y} ${z} ${x + 2} ${y} ${z + 2} minecraft:stone`);
        // Dirt, because the wall is what gets mined and a bare hand takes nothing off stone.
        server.command(`fill ${x + 1} ${y + 2} ${z + 3} ${x + 1} ${y + 4} ${z + 3} minecraft:dirt`);
        server.command(`teleport ${playerName} ${standX} ${y + 1} ${standZ}`);

        const deadline = Date.now() + 30_000;
        for (;;) {
            const feet = vec3(await client.state(), 'feet');
            if (Math.hypot(feet[0] - standX, feet[1] - (y + 1), feet[2] - standZ) < 1) break;
            assert.ok(Date.now() < deadline, `the client did not reach the platform; at ${feet.join(', ')}`);
            await sleep(250);
        }

        // Yaw 0 faces the wall and nothing else is within reach up here, so a drop can only
        // come out of it - and only a client that applied the fill knows the wall is there.
        await client.input({ look: { yaw: 0, pitch: 0, frames: 0 } });
        const before = itemActorCount(await client.state());
        // A slow runner can lose the start of the hold, so swing again if no drop appeared.
        let after = before;
        for (let swing = 0; after <= before && swing < 3; swing += 1) {
            await client.input({ hold: ['key.attack'] });
            await sleep(1_250);
            await client.input({ release_all: true });

            for (let attempt = 0; after <= before && attempt < 12; attempt += 1) {
                await sleep(250);
                after = itemActorCount(await client.state());
            }
        }

        assert.ok(after > before, `breaking a block of the filled wall exposed ${after - before} item actors`);
        log('the client stood on a platform one fill placed and broke a block out of the wall beside it');
    }
};
