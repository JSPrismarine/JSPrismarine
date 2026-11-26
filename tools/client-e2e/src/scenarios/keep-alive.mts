/**
 * A Bedrock client in the world answers the server's keep-alive pings, so it stays connected past
 * several intervals. The server pings with `NetworkStackLatency`, and a client that left one
 * unanswered until the next would be disconnected with `Timed out`.
 */
import assert from 'node:assert/strict';

import type { Scenario } from '../scenario.mts';
import { onlineCount, sleep } from '../scenario.mts';

/**
 * The interval the server runs this scenario's suite with, in seconds. It has to outlast the
 * longest stall of a client on a CI runner: its shader warmup on the loading screen holds the
 * main thread for about three seconds, and a 2 s interval timed it out there.
 */
const INTERVAL_SECONDS = 5;

/** How many intervals the client stays through. */
const INTERVALS = 4;

export const keepAlive: Scenario = {
    name: 'keep-alive',
    description: 'a client answers the keep-alive pings and stays connected past several intervals',
    serverOptions: { keepAliveInterval: INTERVAL_SECONDS },
    run: async ({ client, server, log }) => {
        await sleep(INTERVAL_SECONDS * INTERVALS * 1000);

        assert.ok(!/Timed out/.test(client.output()), 'the server timed the client out');
        assert.equal(await onlineCount(server), 1, 'the client is no longer online');
        log(`the client stayed connected through ${INTERVALS} keep-alive intervals of ${INTERVAL_SECONDS} s`);
    }
};
