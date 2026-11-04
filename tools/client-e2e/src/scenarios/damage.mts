/** Verifies damage dealt on the server shows up in the client's health. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep } from '../scenario.mts';

type Context = Parameters<Scenario['run']>[0];

/** Reads the player's current health from the client. */
const health = async (client: Context['client']): Promise<number> => {
    const value = (await client.state()).health;
    assert.ok(typeof value === 'object' && value !== null, 'state.health present');
    const current = (value as Record<string, unknown>).current;
    assert.ok(typeof current === 'number', `health.current is a number: ${JSON.stringify(value)}`);
    return current;
};

/** Polls until the health satisfies `accept`, returning the accepted value. */
const healthWhere = async (
    client: Context['client'],
    accept: (value: number) => boolean,
    what: string
): Promise<number> => {
    const deadline = Date.now() + 15_000;
    for (;;) {
        const value = await health(client);
        if (accept(value)) return value;
        assert.ok(Date.now() < deadline, `${what}; health stayed ${value}`);
        await sleep(250);
    }
};

export const damage: Scenario = {
    name: 'damage',
    description: 'server-side damage lowers the health the client shows',
    run: async ({ client, server, playerName, log }) => {
        const before = await health(client);
        server.command(`damage ${playerName} 6`);
        const hurt = await healthWhere(client, (value) => value <= before - 5, 'the client never took the damage');

        log(`health ${before} -> ${hurt}`);
    }
};
