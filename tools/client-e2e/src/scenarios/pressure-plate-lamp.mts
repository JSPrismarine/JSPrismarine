/**
 * Verifies a player stepping onto a pressure plate lights the redstone lamp beside it, and
 * stepping off puts it out once the plate releases.
 *
 * The server never told a block that an entity had moved into it, so a plate the server placed
 * stayed off whoever stood on it. The entity runtime now runs `onStepOn` for each block a body's
 * box moves into, as Java's `Entity.checkInsideBlocks` calls `entityInside`.
 */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { placeBlockAndWait, standAt, testForBlock, untilTicks, waitTicks } from '../scenario.mts';

const FIXTURE_X = 72;
const PLATE = { x: FIXTURE_X, y: 64, z: 2 };
const LAMP = { x: FIXTURE_X + 1, y: 64, z: 2 };
const OFF_PLATE = { x: FIXTURE_X + 0.5, y: 64, z: 0.5 };
const ON_PLATE = { x: FIXTURE_X + 0.5, y: 64, z: 2.5 };

/** How many ticks the lamp gets to follow the plate; a plate releases 20 ticks after it empties. */
const LAMP_TICKS = 60;

export const pressurePlateLamp: Scenario = {
    name: 'pressure-plate-lamp',
    description: 'stepping onto a pressure plate lights the lamp beside it, and stepping off puts it out',
    run: async (context) => {
        const { client, server, playerName, log } = context;
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        // Stand at the fixture first so its chunks load, as `setblock` into an unloaded chunk is dropped.
        server.command(`gamemode creative ${playerName}`);
        server.command(`teleport ${playerName} ${OFF_PLATE.x} ${OFF_PLATE.y} ${OFF_PLATE.z}`);
        await waitTicks(server, 40);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
        for (const z of [0, 1, 2]) {
            await placeBlockAndWait(server, { x: FIXTURE_X, y: 63, z }, 'minecraft:stone');
            await placeBlockAndWait(server, { x: FIXTURE_X + 1, y: 63, z }, 'minecraft:stone');
        }
        await placeBlockAndWait(server, PLATE, 'minecraft:stone_pressure_plate');
        await placeBlockAndWait(server, LAMP, 'minecraft:redstone_lamp');
        await standAt(context, OFF_PLATE);

        const found = async (at: typeof PLATE, block: string): Promise<boolean> =>
            /Found the block at/.test(await testForBlock(server, at, block));
        assert.ok(await found(LAMP, 'minecraft:redstone_lamp'), 'the lamp starts unlit');

        await standAt(context, ON_PLATE);
        assert.ok(
            await untilTicks(server, LAMP_TICKS, () => found(LAMP, 'minecraft:lit_redstone_lamp')),
            'the lamp lights while the player stands on the plate'
        );

        await standAt(context, OFF_PLATE);
        assert.ok(
            await untilTicks(server, LAMP_TICKS, () => found(LAMP, 'minecraft:redstone_lamp')),
            'the lamp goes out once the player has stepped off the plate'
        );
        log('standing on the plate lit the lamp, and stepping off put it out');
    }
};
