/** Verifies a long fall hurts the client's player and a short drop does not. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { placeBlockAndWait, sleep, vec3, waitTicks } from '../scenario.mts';

type Context = Parameters<Scenario['run']>[0];

/** How far above the feet a player's eyes are, which is where `server_position` is measured. */
const EYE_HEIGHT = 1.62;

const health = async (client: Context['client']): Promise<number> => {
    const value = (await client.state()).health;
    assert.ok(typeof value === 'object' && value !== null, 'state.health present');
    const current = (value as Record<string, unknown>).current;
    assert.ok(typeof current === 'number', `health.current is a number: ${JSON.stringify(value)}`);
    return current;
};

/**
 * Drops the player from `height` and waits until they stand on the floor again.
 *
 * Two observations in order, neither a race. The client's `server_position` is the last position
 * the server sent, at the eyes, so it reaching the drop height says the teleport arrived; only then does the
 * floor mean a landing. Watching the feet for the airborne moment instead missed a three block
 * drop, which is in the air for under half a second, whenever a poll took longer than that.
 */
const dropFrom = async ({ client, server, playerName }: Context, height: number): Promise<void> => {
    server.command(`teleport ${playerName} 0.5 ${height} 0.5`);
    const deadline = Date.now() + 20_000;
    let teleported = false;
    for (;;) {
        const state = await client.state();
        if (!teleported && Math.abs(vec3(state, 'server_position')[1] - EYE_HEIGHT - height) < 0.6) teleported = true;
        const feet = vec3(state, 'feet')[1];
        if (teleported && Math.abs(feet - 64) < 0.1) return;
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
    description: 'an eleven block fall costs health while a three block drop costs none',
    run: async (context) => {
        const { client, server, log } = context;
        // Its own floor at y 63, rather than whatever an earlier scenario left: run alone, the
        // drop used to fall to the flat world's ground at y -60 and never land where it looked.
        server.command('fill -2 63 -2 2 63 2 minecraft:stone');
        await placeBlockAndWait(server, { x: 0, y: 63, z: 0 }, 'minecraft:stone');
        const start = await health(client);

        await dropFrom(context, 67);
        await waitTicks(server, 10);
        assert.equal(await health(client), start, 'a three block drop should not hurt');

        await dropFrom(context, 75);
        await waitTicks(server, 10);
        const hurt = await health(client);
        assert.ok(hurt < start - 4, `an eleven block fall left health at ${hurt} from ${start}`);

        log(`fall took health from ${start} to ${hurt}`);
    }
};
