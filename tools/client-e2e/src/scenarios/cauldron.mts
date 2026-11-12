/** Verifies a cauldron exchange spends the container held by a survival client. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { lookTo, placeBlockAndWait, standAt, testForBlock, untilTicks, waitTicks } from '../scenario.mts';

/** Checks the server's inventory after a real client pours water into a cauldron. */
export const cauldron: Scenario = {
    name: 'cauldron',
    description: 'pouring water into a cauldron spends one held bucket',
    run: async (context) => {
        const { client, server, playerName } = context;
        const position = { x: 0, y: 64, z: 2 };
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        await placeBlockAndWait(server, position, 'minecraft:cauldron ["fill_level"=0]');
        await standAt(context, { x: 0.5, y: 64, z: 0.5 });
        server.command(`gamemode survival ${playerName}`);
        server.command(`replaceitem entity ${playerName} slot.hotbar 0 minecraft:water_bucket 1`);
        await waitTicks(server, 5);
        await lookTo(client, 0, 35);
        await client.input({ press: ['MouseRight'], press_frames: 3 });
        await client.input({ release_all: true });
        assert.ok(
            await untilTicks(server, 40, async () =>
                /Found the block at/.test(await testForBlock(server, position, 'minecraft:cauldron ["fill_level"=6]'))
            ),
            'the click filled the cauldron'
        );
        const counted = server.waitForLine(/Found \d+ matching/, 10_000);
        server.command(`clear ${playerName} minecraft:water_bucket 0`);
        assert.match(await counted, /Found 0 matching/, 'the input bucket was spent');
    }
};
