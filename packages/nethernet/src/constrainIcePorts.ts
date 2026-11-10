import { isRecord } from './isRecord';
import type { PortRange } from './udpPorts';

/** The WebRTC backend npm `nethernet` builds peer connections from, as far as this needs it. */
interface WebRtcBackend {
    readonly RTCPeerConnection: new (configuration: Record<string, unknown>) => object;
}

const isBackend = (value: unknown): value is WebRtcBackend =>
    isRecord(value) && typeof value.RTCPeerConnection === 'function';

/**
 * Makes every peer connection a `nethernet` `Server` builds take its UDP ports from `range`.
 *
 * `nethernet` 1.1.2 passes nothing but ICE servers to the peer connections it builds, so there is
 * no option to set; this wraps the backend it holds instead. Werift, its default backend, honors
 * `icePortRange`; the optional native backend ignores it. Replace this with an option once
 * `nethernet` takes a peer connection configuration.
 * @param server - The `nethernet` `Server`, before it negotiates any peer.
 * @param range - The ports to allocate from, at least two.
 * @throws {Error} When the server does not hold a backend in the shape this expects.
 */
export const constrainIcePorts = (server: object, range: PortRange): void => {
    const backend: unknown = Reflect.get(server, 'webrtc');
    if (!isBackend(backend)) throw new Error('This nethernet server has no WebRTC backend to give a port range');

    const Base = backend.RTCPeerConnection;
    const icePortRange: [number, number] = [range.start, range.end];
    class RangedPeerConnection extends Base {
        public constructor(configuration: Record<string, unknown>) {
            super({ ...configuration, icePortRange });
        }
    }
    Reflect.set(server, 'webrtc', { ...backend, RTCPeerConnection: RangedPeerConnection });
};
