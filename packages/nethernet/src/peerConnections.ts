import { isRecord } from './isRecord';

/** The WebRTC backend npm `nethernet` builds peer connections from, as far as this needs it. */
interface WebRtcBackend {
    readonly RTCPeerConnection: new (configuration: Record<string, unknown>) => object;
}

const isBackend = (value: unknown): value is WebRtcBackend =>
    isRecord(value) && typeof value.RTCPeerConnection === 'function';

/** The peer connection classes this module made, so {@link adaptPeerConnections} can tell them apart. */
const wrappers = new WeakSet<object>();

/**
 * The backend a `nethernet` `Server` or `Client` holds.
 * @throws {Error} When it holds none in the shape this expects.
 */
const backendOf = (holder: object): WebRtcBackend => {
    const backend: unknown = Reflect.get(holder, 'webrtc');
    if (!isBackend(backend)) throw new Error('This nethernet server or client has no WebRTC backend to configure');
    return backend;
};

/**
 * Makes every peer connection `holder` builds take `configuration` on top of its own.
 *
 * `nethernet` 1.1.2 passes nothing but ICE servers to the peer connections it builds, so there is
 * no option to set; this wraps the backend it holds instead. Replace it with an option once
 * `nethernet` takes a peer connection configuration.
 * @param holder - A `nethernet` `Server` or `Client`, before it negotiates any peer.
 * @param configuration - Peer connection settings, as werift's `RTCPeerConnection` reads them.
 * @throws {Error} When the holder has no backend in the shape this expects.
 */
export const configurePeerConnections = (holder: object, configuration: Record<string, unknown>): void => {
    const backend = backendOf(holder);
    const Base = backend.RTCPeerConnection;
    class ConfiguredPeerConnection extends Base {
        public constructor(own: Record<string, unknown>) {
            super({ ...own, ...configuration });
        }
    }
    wrappers.add(ConfiguredPeerConnection);
    Reflect.set(holder, 'webrtc', { ...backend, RTCPeerConnection: ConfiguredPeerConnection });
};

/**
 * Fits the werift peer connections `nethernet` 1.1.2 builds to the werift the workspace runs.
 *
 * `nethernet` pins werift 0.24.4 and works around two of its bugs; the workspace overrides werift
 * to a release that fixes them, and both workarounds misfire there:
 *
 * - Its `createDataChannel` sets the unordered bit on the channel's queued `DATA_CHANNEL_OPEN`,
 *   which werift 0.24.4 left out. Werift 0.26 sends the bit itself and no longer queues the open
 *   where the workaround looks, so creating an unordered channel threw. Werift's own method is
 *   called instead.
 * - It turns werift's default Google STUN server off by assigning `stunServer`, a property werift
 *   0.27 made read-only, so every answer waited on a STUN query again. `iceUseDefaultStunServer`
 *   turns it off.
 *
 * The native `@roamhq/wrtc` backend has neither workaround and is left as it is.
 * @param holder - A `nethernet` `Server` or `Client` that has not been configured yet, before it
 * negotiates any peer.
 * @throws {Error} When the holder has no backend in the shape this expects, or the backend was
 * already wrapped, which would hide `nethernet`'s own class.
 */
export const adaptPeerConnections = (holder: object): void => {
    const backend = backendOf(holder);
    const NetherNetPeerConnection = backend.RTCPeerConnection;
    if (wrappers.has(NetherNetPeerConnection)) {
        throw new Error('Adapt a nethernet server or client before configuring its peer connections');
    }

    const prototype: unknown = NetherNetPeerConnection.prototype;
    const parent: unknown = isRecord(prototype) ? Object.getPrototypeOf(prototype) : undefined;
    const overridden = isRecord(prototype) && Object.hasOwn(prototype, 'createDataChannel');
    const inherited = isRecord(parent) ? parent.createDataChannel : undefined;
    if (!overridden || typeof inherited !== 'function') return;
    const weriftCreate = inherited;

    class AdaptedPeerConnection extends NetherNetPeerConnection {
        public constructor(own: Record<string, unknown>) {
            super({ ...own, iceUseDefaultStunServer: false });
        }

        public createDataChannel(...args: unknown[]): unknown {
            return Reflect.apply(weriftCreate, this, args);
        }
    }
    wrappers.add(AdaptedPeerConnection);
    Reflect.set(holder, 'webrtc', { ...backend, RTCPeerConnection: AdaptedPeerConnection });
};
