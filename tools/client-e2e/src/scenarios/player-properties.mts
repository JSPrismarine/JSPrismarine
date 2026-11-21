/**
 * Verifies a script's player dynamic properties outlive a logout: the client e2e script counts a
 * player's logins in a dynamic property on the player and tells the player the count and their name
 * at each first spawn, so the same player logging in twice hears `visit 1` and then `visit 2`.
 */
import assert from 'node:assert/strict';

import { isPublishedPlatform, platformKey } from '../../../../packages/script-host/src/platform.ts';
import type { CinnabarClient } from '../client.mts';
import { SCRIPT_VISITS_MESSAGE } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { onlineCount, untilTicks } from '../scenario.mts';

/** The name both visits log in with, so the second finds the record the first left. */
const RETURNING = 'jsp-e2e-visits';

/**
 * Whether the player's chat shows the script's line for a visit count, which only this scenario's
 * logins produce while it runs. The script reads the name and sends the line through the player at
 * its first spawn, so the line also shows the player was valid then.
 */
const chatShowsVisit = async (client: CinnabarClient, visit: number): Promise<boolean> => {
    const { chat } = await client.state();
    return (
        Array.isArray(chat) &&
        chat.map(String).some((line) => line.endsWith(`${SCRIPT_VISITS_MESSAGE}${visit} ${RETURNING}`))
    );
};

export const playerProperties: Scenario = {
    name: 'player-properties',
    description: "a script's dynamic property on a player is still there when the player logs in again",
    run: async ({ server, createClient, log }) => {
        // A platform without a published script host build runs no scripts, as script-world-message says.
        if (!isPublishedPlatform()) {
            log(`skipped: the script host has no build for ${platformKey()}, so the server runs no scripts`);
            return;
        }
        const first = await createClient(RETURNING);
        assert.ok(
            await untilTicks(server, 200, () => chatShowsVisit(first, 1)),
            'the first login never heard "visit 1"'
        );
        log('the first login counted as visit 1');

        const online = await onlineCount(server);
        await first.close();
        const gone = await untilTicks(server, 600, async () => (await onlineCount(server)) < online);
        assert.ok(gone, `the server still counts ${online} players after ${RETURNING} left`);

        const second = await createClient(RETURNING);
        assert.ok(
            await untilTicks(server, 200, () => chatShowsVisit(second, 2)),
            'the second login never heard "visit 2": the property did not survive the logout'
        );
        log('the second login counted as visit 2, so the property survived the logout');
        await second.close();
    }
};
