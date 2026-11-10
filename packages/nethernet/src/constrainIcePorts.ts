import { configurePeerConnections } from './peerConnections';
import type { PortRange } from './udpPorts';

/**
 * Makes every peer connection a `nethernet` `Server` builds take its UDP ports from `range`.
 *
 * Werift, `nethernet`'s default backend, honors `icePortRange`; the optional native backend
 * ignores it.
 * @param server - The `nethernet` `Server`, before it negotiates any peer.
 * @param range - The ports to allocate from, at least two.
 * @throws {Error} When the server does not hold a backend in the shape this expects.
 */
export const constrainIcePorts = (server: object, range: PortRange): void => {
    configurePeerConnections(server, { icePortRange: [range.start, range.end] });
};
