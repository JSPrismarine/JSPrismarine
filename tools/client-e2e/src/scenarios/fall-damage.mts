/** Verifies a long fall hurts the client's player and a short drop does not. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, vec3, waitTicks } from '../scenario.mts';

type Context = Parameters<Scenario['run']>[0];

const health = async (client: Context['client']): Promise<number> => {
    const value = (await client.state()).health;
    assert.ok(typeof value === 'object' && value !== null, 'state.health present');
    const current = (value as Record<string, unknown>).current;
    assert.ok(typeof current === 'number', `health.current is a number: ${JSON.stringify(value)}`);
    return current;
};

/** Drops the player from `height` and waits until they stand on the floor again. */
const dropFrom = async ({ client, server, playerName }: Context, height: number): Promise<void> => {
    server.command(`teleport ${playerName} 0.5 ${height} 0.5`);
    const deadline = Date.now() + 20_000;
    let sawAirborne = false;
    for (;;) {
        const y = vec3(await client.state(), 'feet')[1];
        if (y > 65) sawAirborne = true;
        if (sawAirborne && Math.abs(y - 64) < 0.1) return;
        assert.ok(Date.now() < deadline, `player never landed; feet y is ${y}`);
        await sleep(100);
    }
};

export const fallDamage: Scenario = {
    name: 'fall-damage',
    description: 'an eleven block fall costs health while a three block drop costs none',
    run: async (context) => {
        const { client, server, log } = context;
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
