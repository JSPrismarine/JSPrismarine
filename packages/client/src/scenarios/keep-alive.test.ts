/**
 * The server's keep-alive pings: the client e2e scenario `keep-alive`, played over a loopback
 * pipe against a server stepped by hand.
 *
 * The server pings with `NetworkStackLatency` every `keep-alive-interval` seconds on a real
 * `setInterval`, not on its ticks, so the test fakes `setInterval` alone and moves it on by hand;
 * the ticks and the pipes still run on `setImmediate`. `Client` answers each ping itself
 * (`LatencyPing`), as a retail client and cinnabar do.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { NetworkStackLatencyPacket } from '../LatencyPing';
import type { DecodedPacket } from '../net/ClientPacketRegistry';
import type { LoopbackServer } from '../testing/loopbackServer.test-utils';
import { startLoopbackServer } from '../testing/loopbackServer.test-utils';

/** The interval the cinnabar scenario's suite runs with, in seconds. */
const INTERVAL_SECONDS = 5;
/** How many intervals the client stays through. */
const INTERVALS = 4;

let jsp: LoopbackServer;

// Booting the server builds its content, the slow part, so it happens once for the file.
beforeAll(async () => {
    // The loopback harness turns the pings off; this file is the one that checks them.
    jsp = await startLoopbackServer({
        name: 'keep-alive-scenario',
        config: { 'keep-alive-interval': INTERVAL_SECONDS }
    });
}, 1_200_000);

afterEach(() => {
    vi.useRealTimers();
});

afterAll(async () => {
    await jsp?.close();
}, 60_000);

describe('keep-alive', () => {
    it('keeps a client that answers the pings connected past several intervals', async () => {
        // Before the join, which starts the player's pings.
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        const player = await jsp.join('Pinged');
        let pings = 0;
        player.client.on('packet', ({ packet }: DecodedPacket) => {
            if (packet instanceof NetworkStackLatencyPacket && packet.getPacketData()?.isFromServer === true) pings++;
        });

        for (let interval = 0; interval < INTERVALS; interval++) {
            vi.advanceTimersByTime(INTERVAL_SECONDS * 1000);
            await jsp.tick();
        }

        // A ping left unanswered until the next interval would have disconnected the client.
        expect(pings, 'the server did not ping once an interval').toBe(INTERVALS);
        expect(player.world.getDisconnectReason(), 'the server timed the client out').toBeUndefined();
        expect(player.client.isConnected()).toBe(true);
        expect(player.session(), 'the client is no longer online').toBeDefined();
        player.leave();
        await jsp.tick();
    });
});
