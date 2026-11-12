/** Verifies damage dealt on the server shows up in the client's health. */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { healthOf, sleep } from '../scenario.mts';

type Context = Parameters<Scenario['run']>[0];

/** Polls until the health satisfies `accept`, returning the accepted value. */
const healthWhere = async (
    client: Context['client'],
    accept: (value: number) => boolean,
    what: string
): Promise<number> => {
    const deadline = Date.now() + 15_000;
    for (;;) {
        const value = healthOf(await client.state()).current;
        if (accept(value)) return value;
        assert.ok(Date.now() < deadline, `${what}; health stayed ${value}`);
        await sleep(250);
    }
};

export const damage: Scenario = {
    name: 'damage',
    description: 'server-side damage lowers the health the client shows',
    run: async ({ client, server, playerName, log }) => {
        const before = healthOf(await client.state()).current;
        server.command(`damage ${playerName} 6`);
        const hurt = await healthWhere(client, (value) => value <= before - 5, 'the client never took the damage');

        log(`health ${before} -> ${hurt}`);
    }
};
