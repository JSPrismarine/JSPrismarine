import { configurePeerConnections } from './peerConnections';
import { SHARED_PORT_RANGE_END, sharePort } from './sharedUdpPort';
import type { PortRange } from './udpPorts';

/**
 * Makes every peer connection a `nethernet` `Server` builds take its UDP ports from `range`.
 *
 * Werift, `nethernet`'s default backend, honors `icePortRange` and binds a port per peer, so a
 * range holds as many players as it has ports. A one-port range instead serves every peer from a
 * single shared socket, as Bedrock Dedicated Server does. The optional native backend ignores both.
 * @param server - The `nethernet` `Server`, before it negotiates any peer.
 * @param range - The ports to allocate from.
 * @throws {Error} When the server does not hold a backend in the shape this expects.
 */
export const constrainIcePorts = (server: object, range: PortRange): void => {
    if (range.start !== range.end) {
        configurePeerConnections(server, { icePortRange: [range.start, range.end] });
        return;
    }
    const peers = sharePort(range.start);
    configurePeerConnections(server, { icePortRange: [range.start, SHARED_PORT_RANGE_END] }, (peer) =>
        peers.add(new WeakRef(peer))
    );
};
