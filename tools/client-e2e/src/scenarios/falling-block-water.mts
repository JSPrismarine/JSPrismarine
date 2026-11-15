/** Verifies that a block falling into water sinks to the floor and stays there. */
import assert from 'node:assert/strict';

import { standAt, waitTicks } from '../scenario.mts';
import type { Scenario } from '../scenario.mts';

/** Where the player stands, beside the pit, on the flat world's surface. */
const STAND = { x: 26.5, y: -60, z: 20.5 };
/** The pit's column: water two deep over the flat world's dirt. */
const PIT = { x: 28, z: 20 };
const FLOOR_Y = -62;
const SURFACE_Y = -61;

const BLOCK_REPLY = /Found the block at|The block is |The \w+ state does not match|That chunk is not loaded/;
const ENTITY_REPLY = /Found \d+ entities?|No entity was found/;

export const fallingBlockWater: Scenario = {
    name: 'falling-block-water',
    description: 'gravel dropped into water sinks to the floor of the pit and does not fall again',
    run: async (context) => {
        const { server, log } = context;
        await standAt(context, STAND);

        server.command(`fill ${PIT.x} ${FLOOR_Y} ${PIT.z} ${PIT.x} ${SURFACE_Y} ${PIT.z} minecraft:water`);
        await waitTicks(server, 5);
        server.command(`setblock ${PIT.x} ${SURFACE_Y + 1} ${PIT.z} minecraft:gravel`);
        await waitTicks(server, 60);

        const landed = server.waitForLine(BLOCK_REPLY, 10_000);
        server.command(`testforblock ${PIT.x} ${FLOOR_Y} ${PIT.z} minecraft:gravel`);
        assert.match(await landed, /Found the block at/, 'the gravel did not reach the floor of the pit');

        // The bug this guards against: the block landed on the surface, fell again, and kept a
        // falling block alive every other tick for as long as the chunk stayed loaded.
        const falling = server.waitForLine(ENTITY_REPLY, 10_000);
        server.command('testfor @e[type=minecraft:falling_block]');
        assert.match(await falling, /No entity was found|Found 0/, 'a falling block is still moving over the pit');
        log('the gravel sank through two blocks of water and came to rest on the floor');

        server.command(`fill ${PIT.x} ${FLOOR_Y} ${PIT.z} ${PIT.x} ${SURFACE_Y} ${PIT.z} minecraft:dirt`);
    }
};
