/** Verifies the bulk block changes of one sub chunk reach the real client. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, standAt, testForBlock, waitTicks } from '../scenario.mts';

/** A spot in the air, clear of the flat surface and of what the other scenarios build. */
const FLOOR = { x: 100, y: 63, z: 100 };

export const subChunkBlockChanges: Scenario = {
    name: 'sub-chunk-block-changes',
    description: 'blocks a single fill changed in one sub chunk reach the client',
    run: async (context) => {
        const { server, client, playerName, log } = context;
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);

        const { x, y, z } = FLOOR;
        const standX = x + 1.5;
        const standZ = z + 1.5;
        // The platform is far from where the client joined. Go there first and let its chunks
        // arrive, or the client falls through ground it has not been sent yet and the fill lands
        // in a chunk it has not loaded.
        // Nothing stands up here yet, so the player falls until the platform exists; a survival
        // player falls a hundred blocks and dies, and a dead player cannot mine.
        server.command(`gamemode creative ${playerName}`);
        server.command(`teleport ${playerName} ${standX} ${y + 1} ${standZ}`);
        await waitTicks(server, 40);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 120_000);

        // Something to stand on, then a wall in front of it. Each is one fill, so its blocks
        // share a sub chunk and travel as one `UpdateSubChunkBlocksPacket` rather than as one
        // `UpdateBlockPacket` each.
        server.command(`fill ${x} ${y} ${z} ${x + 2} ${y} ${z + 2} minecraft:stone`);
        // Dirt, because the wall is what gets mined and a bare hand takes nothing off stone.
        server.command(`fill ${x + 1} ${y + 2} ${z + 3} ${x + 1} ${y + 4} ${z + 3} minecraft:dirt`);
        await standAt(context, { x: standX, y: y + 1, z: standZ });
        server.command(`gamemode survival ${playerName}`);

        // Yaw 0 faces the wall and nothing else is within reach up here, so a drop can only
        // come out of it - and only a client that applied the fill knows the wall is there.
        await client.input({ look: { yaw: 0, pitch: 0, frames: 0 } });
        // Hold until the server has broken the block. Nothing else in this world breaks blocks, so
        // an air wall is the client's own break, and it can only have aimed at a wall it knew was
        // there. The drop is not the evidence: it pops to the player a block and a half away and
        // is picked up within moments, which is faster than a loaded client reports it.
        await client.input({ hold: ['key.attack'] });
        const brokeBy = Date.now() + 30_000;
        let broken = '';
        for (;;) {
            broken = await testForBlock(server, { x: x + 1, y: y + 2, z: z + 3 }, 'minecraft:air');
            if (/Found the block at/.test(broken) || Date.now() > brokeBy) break;
            await sleep(250);
        }
        await client.input({ release_all: true });

        assert.match(broken, /Found the block at/, `the client never broke a block of the filled wall: ${broken}`);
        log('the client stood on a platform one fill placed and broke a block out of the wall beside it');
    }
};
