import dgram from 'node:dgram';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';

import { loadDriver, nativeAvailable } from './testing/nativeDriver.test.helper';
import type { PeerState } from './WebRtcDriver';

describe.skipIf(!nativeAvailable())('the native driver', async () => {
    const driver = await loadDriver();

    it('explains a failed call with what the library logged while it ran, and runs no handler inside it', async () => {
        // A dual-stack socket holds the port on both families, as another program's would.
        const holder = dgram.createSocket('udp6');
        holder.bind(0, '::');
        await once(holder, 'listening');
        const port = holder.address().port;
        const offerer = driver.createPeer({ bindAddress: '127.0.0.1' });
        const peer = driver.createPeer({ enableIceUdpMux: true, portRangeBegin: port, portRangeEnd: port });
        try {
            offerer.createDataChannel('ReliableDataChannel');
            const offer = await offerer.localDescription();
            const states: PeerState[] = [];
            peer.onStateChange((state) => states.push(state));

            // The peer binds its port when it applies the offer.
            expect(() => peer.setRemoteDescription('offer', offer)).toThrow(
                `Setting the remote description failed (libdatachannel error -2): juice: UDP socket binding failed on port ${port}`
            );
            expect(states).toStrictEqual([]);
        } finally {
            peer.close();
            offerer.close();
            holder.close();
        }
    });
});
