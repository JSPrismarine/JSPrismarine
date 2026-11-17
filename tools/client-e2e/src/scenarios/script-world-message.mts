/**
 * Verifies a behavior pack script reaches the client: `/weather` changes the weather, the
 * script's `weatherChange` after-event runs in the script flush at the end of that tick, and its
 * `world.sendMessage` puts a line in the player's chat.
 */
import assert from 'node:assert/strict';

import { SCRIPT_WEATHER_MESSAGE } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { sleep } from '../scenario.mts';

/** What the server logs when the platform has no script host library, and so runs no scripts. */
const NO_SCRIPT_HOST = /the script host has no library for this machine/;

export const scriptWorldMessage: Scenario = {
    name: 'script-world-message',
    description:
        "a behavior pack script's world.sendMessage, sent from its weatherChange after-event, shows in the player's chat",
    run: async ({ client, server, log }) => {
        // The script host builds on Linux x64 only for now (issue #3215); elsewhere the server
        // says so at startup and runs without scripts, which this scenario cannot check.
        if (server.lines.some((line) => NO_SCRIPT_HOST.test(line))) {
            log('skipped: this platform has no script host library, so the server runs no scripts');
            return;
        }

        const expected = `${SCRIPT_WEATHER_MESSAGE}Rain`;
        server.command('weather rain');
        try {
            const deadline = Date.now() + 15_000;
            for (;;) {
                const { chat } = await client.state();
                const lines = Array.isArray(chat) ? chat.map(String) : [];
                if (lines.some((line) => line.includes(expected))) break;
                assert.ok(Date.now() < deadline, `chat never showed "${expected}"; chat: ${JSON.stringify(chat)}`);
                await sleep(250);
            }
            log(`chat showed "${expected}"`);
        } finally {
            server.command('weather clear');
        }
    }
};
