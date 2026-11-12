/** Verifies a long fall hurts the client's player, and a short drop or a landing on hay does not. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { healthOf, placeBlockAndWait, sleep, vec3, waitTicks } from '../scenario.mts';

type Context = Parameters<Scenario['run']>[0];

/** How far above the feet a player's eyes are, which is where `server_position` is measured. */
const EYE_HEIGHT = 1.62;

/** Where the feet stand on the scenario's floor, which is at y 63. */
const FLOOR = 64;

/** Whether the client's `server_position` is the eyes of a teleport to feet height `y`. */
const teleportedTo = (state: Record<string, unknown>, y: number): boolean =>
    Math.abs(vec3(state, 'server_position')[1] - EYE_HEIGHT - y) < 0.6;

/**
 * Drops the player from `height` and waits until they stand on the floor again.
 *
 * Two observations in order, neither a race. The client's `server_position` is the last position
 * the server sent, at the eyes, so it reaching the drop height says the teleport arrived; only then does the
 * floor mean a landing. Watching the feet for the airborne moment instead missed a three block
 * drop, which is in the air for under half a second, whenever a poll took longer than that.
 *
 * `server_position` keeps the last teleport, though, so after a drop from the same height it
 * reads as arrived before this teleport is even sent, and the player still stands on the floor.
 * The hay drop followed the eleven block one that way and returned at once: the stone went back
 * under a player who had not fallen yet, and on a slow runner they landed on it. A teleport to
 * the floor first makes this drop's own teleport the one that moves `server_position`.
 */
export const dropFrom = async (
    context: Pick<Context, 'playerName'> & {
        readonly client: Pick<Context['client'], 'state'>;
        readonly server: Pick<Context['server'], 'command'>;
    },
    height: number
): Promise<void> => {
    const { client, server, playerName } = context;
    if (height !== FLOOR && teleportedTo(await client.state(), height)) await dropFrom(context, FLOOR);

    server.command(`teleport ${playerName} 0.5 ${height} 0.5`);
    const deadline = Date.now() + 20_000;
    let teleported = false;
    for (;;) {
        const state = await client.state();
        if (!teleported && teleportedTo(state, height)) teleported = true;
        const feet = vec3(state, 'feet')[1];
        if (teleported && Math.abs(feet - FLOOR) < 0.1) return;
        assert.ok(
            Date.now() < deadline,
            teleported
                ? `player never landed; feet y is ${feet}`
                : `the teleport to y ${height} never reached the client`
        );
        await sleep(100);
    }
};

export const fallDamage: Scenario = {
    name: 'fall-damage',
    description: 'an eleven block fall costs health while a three block drop or one onto hay costs none',
    run: async (context) => {
        const { client, server, log } = context;
        // Its own floor at y 63, rather than whatever an earlier scenario left: run alone, the
        // drop used to fall to the flat world's ground at y -60 and never land where it looked.
        server.command('fill -2 63 -2 2 63 2 minecraft:stone');
        await placeBlockAndWait(server, { x: 0, y: 63, z: 0 }, 'minecraft:stone');
        const start = healthOf(await client.state()).current;

        await dropFrom(context, 67);
        await waitTicks(server, 10);
        assert.equal(healthOf(await client.state()).current, start, 'a three block drop should not hurt');

        await dropFrom(context, 75);
        await waitTicks(server, 10);
        const hurt = healthOf(await client.state()).current;
        assert.ok(hurt < start - 4, `an eleven block fall left health at ${hurt} from ${start}`);

        log(`fall took health from ${start} to ${hurt}`);

        // A hay bale under the feet breaks the fall. The server used to read the blocks under the
        // eyes, which the client reports, so the bale was never seen. Natural regeneration may
        // heal a point meanwhile, so this asserts no loss rather than an equal health.
        await placeBlockAndWait(server, { x: 0, y: 63, z: 0 }, 'minecraft:hay_block');
        await dropFrom(context, 75);
        await waitTicks(server, 10);
        const onHay = healthOf(await client.state()).current;
        assert.ok(onHay >= hurt, `an eleven block fall onto hay took health from ${hurt} to ${onHay}`);
        await placeBlockAndWait(server, { x: 0, y: 63, z: 0 }, 'minecraft:stone');
        log(`an eleven block fall onto hay left health at ${onHay}`);
    }
};
