/**
 * Verifies a kicked client is told why. The client must receive the `DisconnectPacket` with the
 * reason before the connection closes: over NetherNet, closing before it arrived showed
 * `NetherNetDataChannelClosed` (`ClientDisconnection-122`) instead.
 */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { sleep } from '../scenario.mts';

/** The line cinnabar writes when its session ends, with the server's disconnect when there was one. */
const TERMINAL_MARKER = 'CINNABAR_NETWORK_PUMP_TERMINAL=';

export const kick: Scenario = {
    name: 'kick',
    description: 'a kicked client is shown the reason the server gave',
    run: async ({ client, server, playerName, log }) => {
        const reason = `Kicked-for-the-e2e-${Date.now()}`;
        server.command(`kick ${playerName} ${reason}`);

        const deadline = Date.now() + 20_000;
        for (;;) {
            const marker = client
                .output()
                .split('\n')
                .find((line) => line.includes(TERMINAL_MARKER));
            if (marker !== undefined) {
                // The marker's JSON is the client's own record of the session's end.
                const terminal = JSON.parse(marker.slice(marker.indexOf(TERMINAL_MARKER) + TERMINAL_MARKER.length)) as {
                    server_disconnect?: { message?: string };
                };
                assert.ok(
                    terminal.server_disconnect?.message?.includes(reason),
                    `the client ended without the kick's reason: ${marker}`
                );
                break;
            }
            assert.ok(Date.now() < deadline, 'the client never reported the end of its session');
            await sleep(250);
        }
        log(`the client was disconnected with "${reason}"`);
    }
};
