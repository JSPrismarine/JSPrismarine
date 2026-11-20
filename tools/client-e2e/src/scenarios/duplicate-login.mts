/** Verifies that two clients logging in as one account at once leave one live player, not two. */
import assert from 'node:assert/strict';

import type { CinnabarClient } from '../client.mts';
import type { Scenario } from '../scenario.mts';
import { onlineCount, untilTicks, waitTicks } from '../scenario.mts';

/** The name both clients log in with. */
const TWIN = 'jsp-e2e-twin';

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

        // Both launched first, then connected one after the other, the second once the server
        // logs the first one's join: that line comes while the first is still joining, and it fixes
        // which login reaches the server first, which the order of two `connect` calls does not.
        // Before #2951 the server looked only at players who had finished joining and let both in.
        const [first, second] = await Promise.all([launchClient(TWIN), launchClient(TWIN)]);
        const firstJoining = server.waitForLine(new RegExp(`${TWIN}\\S* is attempting to join`), 120_000);
        // Not awaited: over NetherNet a connect waits out the trust prompt, which can last until the
        // client is in the world, and the second login has to arrive while the first still joins.
        // The first client may be dropped before its connect settles, which is the point.
        const firstConnected = connect(first).catch(() => undefined);
        await firstJoining;
        await connect(second);
        await firstConnected;

        const joined = await untilTicks(server, 1200, async () => inWorld(second));
        assert.ok(joined, 'the second login never joined');

        // Long enough for the replaced client to be told so and drop out.
        await waitTicks(server, 60);

        assert.equal(await inWorld(first), false, 'the first login is still in the world after the second replaced it');
        assert.equal(await inWorld(second), true, 'the second login left the world');
        const after = await onlineCount(server);
        assert.equal(after, before + 1, `the server counts ${after} players online, ${before} before the twins`);
        log(`the second ${TWIN} login replaced the first; the server counts ${after} players`);
    }
};
