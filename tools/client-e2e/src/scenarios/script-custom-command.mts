/**
 * Verifies a custom command a behavior pack script registers reaches the player: the client is
 * told about it, a player who runs it gets to the script's callback with their word, and the
 * message the callback returns shows in the player's chat.
 */
import assert from 'node:assert/strict';

import { platformKey } from '../../../../packages/native-library/src/platform.ts';
import { isPublishedPlatform } from '../../../../packages/script-host/src/platform.ts';
import { SCRIPT_COMMAND, SCRIPT_COMMAND_MESSAGE } from '../jsp-server.mts';
import type { Scenario } from '../scenario.mts';
import { sleep } from '../scenario.mts';

/** What the server logs when it cannot load the script host, and so runs no scripts. */
const NO_SCRIPT_HOST =
    /behavior pack\(s\) have scripts, but @jsprismarine\/script-host (is not installed|has no library)/;

export const scriptCustomCommand: Scenario = {
    name: 'script-custom-command',
    description: "a player runs a behavior pack script's custom command and its result message shows in their chat",
    run: async ({ client, server, log }) => {
        // A platform without a published script host build runs no scripts, as script-world-message says.
        if (!isPublishedPlatform(platformKey())) {
            log(`skipped: the script host has no build for ${platformKey()}, so the server runs no scripts`);
            return;
        }
        const unloaded = server.lines.find((line) => NO_SCRIPT_HOST.test(line));
        assert.equal(unloaded, undefined, `the server could not load the script host: ${unloaded}`);

        const expected = `${SCRIPT_COMMAND_MESSAGE}hello by minecraft:player`;
        await client.chat(`/${SCRIPT_COMMAND} hello`);
        const deadline = Date.now() + 15_000;
        for (;;) {
            const { chat } = await client.state();
            const lines = Array.isArray(chat) ? chat.map(String) : [];
            if (lines.some((line) => line.includes(expected))) break;
            assert.ok(Date.now() < deadline, `chat never showed "${expected}"; chat: ${JSON.stringify(chat)}`);
            await sleep(250);
        }
        log(`chat showed "${expected}"`);
    }
};
