/**
 * Verifies the client's chat shows a refused command line with the syntax error BDS words, and
 * that `/time set` refuses a tick count that is not a whole number. A word that names no time of
 * day is no longer a syntax error: 1.26.60 looks it up as a time marker.
 */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, waitTicks } from '../scenario.mts';

/** What Bedrock Dedicated Server 1.26.60.6 answers `/time set 1.5` with. */
const EXPECTED = 'Syntax error: Unexpected "1.5": at "/time set >>1.5<<"';

export const commandSyntaxError: Scenario = {
    name: 'command-syntax-error',
    description: 'a command line with a syntax error is refused in chat with the error BDS shows',
    run: async ({ client, server, playerName, log }) => {
        server.command(`op ${playerName}`);
        await waitTicks(server, 10);
        try {
            await client.chat('/time set 1.5');

            const deadline = Date.now() + 15_000;
            for (;;) {
                const { chat } = await client.state();
                const lines = Array.isArray(chat) ? chat.map(String) : [];
                if (lines.some((line) => line.includes(EXPECTED))) break;
                assert.ok(Date.now() < deadline, `chat never showed the syntax error; chat: ${JSON.stringify(chat)}`);
                await sleep(250);
            }
            log(`chat showed ${EXPECTED}`);
        } finally {
            // permissions-reload follows in the suite, and starts from a player who may not run /tell.
            server.command(`deop ${playerName}`);
            await waitTicks(server, 10);
        }
    }
};
