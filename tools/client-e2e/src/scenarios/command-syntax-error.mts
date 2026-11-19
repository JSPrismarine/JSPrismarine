/**
 * Verifies the client's chat shows a refused command line with the syntax error BDS words, and
 * that `/time add` refuses a word where it expects a number of ticks.
 */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep, waitTicks } from '../scenario.mts';

/**
 * What Bedrock Dedicated Server 1.26.60.6 answers `/time add abc` with, as its captured command
 * answers record. `/time set nonsense` no longer serves: 1.26.60 reads the word as a time marker.
 */
const EXPECTED = 'Syntax error: Unexpected "abc": at "/time add >>abc<<"';

export const commandSyntaxError: Scenario = {
    name: 'command-syntax-error',
    description: 'a command line with a syntax error is refused in chat with the error BDS shows',
    run: async ({ client, server, playerName, log }) => {
        server.command(`op ${playerName}`);
        await waitTicks(server, 10);
        await client.chat('/time add abc');

        const deadline = Date.now() + 15_000;
        for (;;) {
            const { chat } = await client.state();
            const lines = Array.isArray(chat) ? chat.map(String) : [];
            if (lines.some((line) => line.includes(EXPECTED))) break;
            assert.ok(Date.now() < deadline, `chat never showed the syntax error; chat: ${JSON.stringify(chat)}`);
            await sleep(250);
        }
        log(`chat showed ${EXPECTED}`);
    }
};
