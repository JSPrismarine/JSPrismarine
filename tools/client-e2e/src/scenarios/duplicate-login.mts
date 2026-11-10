/** Verifies that two clients logging in as one account at once leave one live player, not two. */
import assert from 'node:assert/strict';

import type { CinnabarClient } from '../client.mts';
import type { JspServer } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { untilTicks, waitTicks } from '../scenario.mts';

/** The name both clients log in with. */
const TWIN = 'jsp-e2e-twin';

/** How many players the server counts as online, from the `list` command. */
const onlineCount = async (server: JspServer): Promise<number> => {
    const reply = server.waitForLine(/There are \d+ players online/, 10_000);
    server.command('list');
    return Number(/There are (\d+) players online/.exec(await reply)?.[1]);
};

/** Whether the client is in the world. A client the server let go may refuse to answer at all. */
const inWorld = async (client: CinnabarClient): Promise<boolean> => {
    try {
        return (await client.state()).in_world === true;
    } catch {
        return false;
    }
};

export const duplicateLogin: Scenario = {
    name: 'duplicate-login',
    description: 'a second login of an account that is still joining replaces the first',
    run: async ({ server, launchClient, connect, log }) => {
        const before = await onlineCount(server);

        // Launched first and connected together, so the second login arrives while the first is
        // still joining: before #2951 the server looked only at players who had finished joining
        // and let both in.
        const twins = await Promise.all([launchClient(TWIN), launchClient(TWIN)]);
        await Promise.all(twins.map(connect));

        const joined = await untilTicks(server, 1200, async () =>
            (await Promise.all(twins.map(inWorld))).some(Boolean)
        );
        assert.ok(joined, 'neither client joined');

        // Long enough for a replaced client that had reached the world to be told so and drop out.
        await waitTicks(server, 60);

        const live = (await Promise.all(twins.map(inWorld))).filter(Boolean).length;
        const after = await onlineCount(server);
        assert.equal(live, 1, `${live} of the two clients named ${TWIN} are in the world`);
        assert.equal(after, before + 1, `the server counts ${after} players online, ${before} before the twins`);
        log(`one of two simultaneous ${TWIN} logins is in the world; the server counts ${after} players`);
    }
};
