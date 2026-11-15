/** Verifies that water Java marks for post-processing flows when its generated chunk loads. */
import assert from 'node:assert/strict';

import { standAt, waitTicks } from '../scenario.mts';
import type { Scenario } from '../scenario.mts';

/**
 * A water source the seed 1234 Overworld leaves marked for post-processing, with cave air beside
 * it. Found by generating the chunks around (-38, 3) with the server's own generator: 29 chunks
 * held 690 marks and only a handful bordered air, since an aquifer keeps a barrier between its
 * water and a cave. Two marked sources border this pocket, this one and (-584, 16, 10), over solid
 * ground, so the water that reaches it becomes a source of its own: Java's infinite water rule.
 */
const SOURCE = { x: -585, y: 16, z: 11 };
const BESIDE = { x: -584, y: 16, z: 11 };

const BLOCK_REPLY = /Found the block at|The block is |The \w+ state does not match|That chunk is not loaded/;

export const generatedFluidFlow: Scenario = {
    name: 'generated-fluid-flow',
    description: 'water Java marks for post-processing in a freshly generated cave flows into the air beside it',
    serverOptions: { worldgenSpawn: true },
    run: async (context) => {
        const { server, playerName, log } = context;
        server.command(`gamemode spectator ${playerName}`);
        await standAt(context, { x: SOURCE.x + 0.5, y: SOURCE.y + 2, z: SOURCE.z + 0.5 }, 180_000);

        // The client's own view says nothing about when the server has the chunk: a noise chunk
        // on a loaded host can take a while to generate. Ask the server until it answers.
        const deadline = Date.now() + 300_000;
        let source = '';
        for (;;) {
            const reply = server.waitForLine(BLOCK_REPLY, 10_000);
            server.command(`testforblock ${SOURCE.x} ${SOURCE.y} ${SOURCE.z} minecraft:water`);
            source = await reply;
            if (!/not loaded/.test(source) || Date.now() > deadline) break;
            await waitTicks(server, 20);
        }
        assert.match(source, /Found the block at/, `the marked water source is still there: ${source}`);

        // The tick was due the moment the chunk entered the world, and a water tick spreads in five.
        await waitTicks(server, 40);

        const beside = server.waitForLine(BLOCK_REPLY, 10_000);
        server.command(`testforblock ${BESIDE.x} ${BESIDE.y} ${BESIDE.z} minecraft:water`);
        assert.match(await beside, /Found the block at/, 'the marked water never flowed into the cave air beside it');
        log('the marked water flowed into the air beside it and settled into a new source');
    }
};
