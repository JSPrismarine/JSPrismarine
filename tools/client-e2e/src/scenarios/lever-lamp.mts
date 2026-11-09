/** Verifies a client flipping a lever powers the redstone lamp beside the block it is attached to. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { lookTo, placeBlockAndWait, standAt, testForBlock, untilTicks, waitTicks } from '../scenario.mts';

const FIXTURE_X = 64;
const LEVER = { x: FIXTURE_X, y: 64, z: 1 };
const LAMP = { x: FIXTURE_X, y: 65, z: 2 };

/**
 * How many ticks the server gets to apply a click before the scenario calls it lost. A click that
 * reached the server flips the lever in the tick that handles it, so this is mostly slack for a
 * server that is behind; at one tick a second it is twenty seconds.
 */
const CLICK_TICKS = 20;

/** How many ticks the lamp gets to follow its lever; Bedrock turns a lamp off four ticks late. */
const LAMP_TICKS = 40;

export const leverLamp: Scenario = {
    name: 'lever-lamp',
    description: 'flipping a lever lights the redstone lamp on its block, and flipping it back puts it out',
    run: async (context) => {
        const { client, server, playerName, log } = context;
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 30_000);
        // The fixture is four chunks from the spawn, and `setblock` into a chunk the server has
        // not loaded is dropped. Stand there first so the chunks load, then build. Nothing holds
        // the player up meanwhile, and a survival player falls to their death and cannot click.
        server.command(`gamemode creative ${playerName}`);
        server.command(`teleport ${playerName} ${FIXTURE_X + 0.5} 64 0.5`);
        await waitTicks(server, 40);
        await client.waitFor({ chunks_loaded: { radius: 2 } }, 60_000);
        // A stone block two ahead with a lever on its player-facing side and a lamp on top.
        await placeBlockAndWait(server, { x: FIXTURE_X, y: 63, z: 0 }, 'minecraft:stone');
        await placeBlockAndWait(server, { x: FIXTURE_X, y: 64, z: 2 }, 'minecraft:stone');
        await placeBlockAndWait(server, LAMP, 'minecraft:redstone_lamp');
        await placeBlockAndWait(server, LEVER, 'minecraft:lever ["lever_direction"="north","open_bit"=false]');
        await standAt(context, { x: FIXTURE_X + 0.5, y: 64, z: 0.5 });
        server.command(`gamemode survival ${playerName}`);

        const found = async (at: typeof LEVER, block: string): Promise<boolean> =>
            /Found the block at/.test(await testForBlock(server, at, block));

        assert.ok(await found(LAMP, 'minecraft:redstone_lamp'), 'the lamp starts unlit');

        // The lever is one block ahead and level with the player's feet; look down at it.
        await lookTo(client, 0, 40);

        /**
         * Clicks the lever until the server reports it at `open`, then waits for the lamp to read
         * `lamp`. The lever's own state says whether a click landed, so a lost click is retried
         * and one that landed late is never clicked again, which would flip the lever back.
         */
        const flip = async (open: boolean, lamp: string): Promise<void> => {
            const lever = `minecraft:lever ["open_bit"=${open}]`;
            for (let click = 1; ; click++) {
                await client.input({ press: ['MouseRight'], press_frames: 3 });
                await client.waitFrames(10);
                await client.input({ release_all: true });
                if (await untilTicks(server, CLICK_TICKS, () => found(LEVER, lever))) break;
                if (click === 5) assert.fail(`five clicks never set the lever's open_bit to ${open}`);
            }
            const followed = await untilTicks(server, LAMP_TICKS, () => found(LAMP, lamp));
            assert.ok(followed, `the lamp reads ${lamp} once the lever is at open_bit=${open}`);
        };

        await flip(true, 'minecraft:lit_redstone_lamp');
        await flip(false, 'minecraft:redstone_lamp');
        log('the lever lit the lamp and flipping it back put it out');
    }
};
