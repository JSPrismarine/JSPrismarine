import { defineErrors, JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';

/** The native library could not be loaded, so NetherNet cannot run here. */
export abstract class NetherNetUnavailableError extends JSPrismarineError {
    public override name = 'NetherNetUnavailableError';
}

/** Thrown for a setting Bedrock Dedicated Server 1.26.70.24 refuses, with its message. */
export abstract class UdpPortsError extends JSPrismarineError {
    public override name = 'UdpPortsError';
}

/** A failed `POST /v1/join/<networkId>`, with what the server answered. */
export abstract class JoinRefusedError extends JSPrismarineError {
    public override name = 'JoinRefusedError';

    /** The HTTP status the server answered with. */
    public get status(): number {
        return Number(this.params.status);
    }

    /** The response body, empty when the server sent none. */
    public get body(): string {
        return String(this.params.body ?? '');
    }
}

/** A signaling request the server refuses, answered with an HTTP error status. */
export abstract class RefusedRequest extends JSPrismarineError {
    public override name = 'RefusedRequest';
}

/** The errors `@jsprismarine/nethernet` throws. */
export const NethernetErrors = defineErrors('nethernet', {
    /**
     * A message is too long to split into the most segments NetherNet allows. The sender built a
     * packet batch larger than the protocol can carry.
     */
    MessageTooLongToSegment: {
        message: "A {byteLength} byte message is longer than NetherNet's {maxSegments} segments of {segmentBytes}",
        base: RangeError
    },
    /**
     * `connect()` was called twice on one NetherNet client. Make a new client for each connection.
     */
    ClientConnectsOnce: 'A NetherNet client connects once',
    /** A message was sent on a NetherNet connection after it closed. */
    ConnectionIsClosed: 'The NetherNet connection is closed',
    /** A message was sent before the NetherNet connection opened or after it closed. */
    ConnectionIsNotOpen: 'The NetherNet connection is not open',
    /**
     * A peer's WebRTC offer has no `a=identity` line, so the server cannot tell who sent it. The
     * client is not a Bedrock client, or is offline-mode only.
     */
    DescriptionHasNoIdentity: 'The description carries no a=identity',
    /** A LAN discovery datagram is too short to be one, so something else sent to UDP port 7551. */
    DiscoveryPacketIsTooShort: 'A discovery packet is too short',
    /**
     * A LAN discovery datagram does not decrypt to a valid packet, so it is damaged or not from
     * Minecraft.
     */
    DiscoveryPacketChecksumDoesNotMatch: 'A discovery packet’s checksum does not match',
    /** A LAN discovery datagram's text field runs past its end, so it is malformed. */
    DiscoveryPacketTextRunsPastEnd: 'A discovery packet’s text runs past its end',
    /** A peer's `a=identity` holds an assertion that is not the JSON Bedrock writes. */
    IdentityAssertionIsMalformed: 'The identity assertion is malformed',
    /**
     * A peer's identity was signed for a different WebRTC description, so somebody reused another
     * session's identity.
     */
    IdentityFingerprintMismatch: "The identity does not sign this description's fingerprints",
    /** A peer's `a=identity` line carries no assertion. */
    IdentityHasNoAssertion: 'The a=identity has no assertion',
    /**
     * A NetherNet identity was made with a key on a curve other than the one Bedrock uses. Generate
     * the key on that curve.
     */
    InvalidIdentityKeyCurve: 'A NetherNet identity key must be {bedrockCurve}',
    /**
     * A peer's identity token expired. The client retries with a fresh one; a server clock that is
     * far off refuses every peer this way.
     */
    IdentityTokenHasExpired: 'The identity token has expired',
    /** A peer's identity token has no claims. */
    IdentityTokenHasNoClaims: 'The identity token has no claims',
    /** A peer's identity token does not carry a public key the server can read. */
    IdentityTokenHasNoKey: 'The identity token has no usable cpk claim',
    /** A peer's identity token is not signed by the key it names, so it is forged. */
    IdentityTokenNotSelfSigned: 'The identity token is not signed by its own key',
    /**
     * The `server-public-ip` setting is not an IP address. Set it to the address clients reach the
     * server at, without a port.
     */
    InvalidServerPublicIp: {
        message: "Invalid value '{text}' for server-public-ip: {notAnIp}",
        base: UdpPortsError
    },
    /**
     * A NetherNet server's join status lacks a number it must have, so the server is not one this
     * client understands.
     */
    JoinStatusHasNoNumber: 'The join status has no number {key}',
    /**
     * A NetherNet server's join status lacks a text field it must have, so the server is not one
     * this client understands.
     */
    JoinStatusHasNoString: 'The join status has no string {key}',
    /**
     * A NetherNet server answered the join status request with something other than a JSON object.
     */
    JoinStatusIsNotObject: 'The join status is not an object',
    /** An empty message was sent on a NetherNet connection. */
    MessageCannotBeEmpty: { message: 'A NetherNet message cannot be empty', base: RangeError },
    /**
     * A peer sent a message larger than the connection accepts, so it is refused and the peer
     * disconnected.
     */
    MessageTooLarge: 'A NetherNet message is longer than the {maxBytes} bytes accepted',
    /**
     * NetherNet needs the native networking library, and it does not load on this machine. The
     * message ends with the loader's reason; the `native-network` errors explain how to install it.
     */
    NativeLibraryCannotLoad: {
        message: "NetherNet's native library cannot load on {platform}-{arch}: {value}",
        base: NetherNetUnavailableError
    },
    /**
     * No server with that network id answered LAN discovery. Check that the server runs on this
     * network and that UDP port 7551 is open.
     */
    NoLanServerAnswered: 'No NetherNet server {networkId} answered on the LAN',
    /**
     * The WebRTC peer closed or failed before it produced its description. The native library's log
     * says why.
     */
    PeerEndedBeforeDescription: 'The peer {state} before it had a description',
    /**
     * The WebRTC peer finished gathering candidates without a description. This is a bug in the
     * native driver.
     */
    PeerHasNoDescription: 'The peer gathered its candidates but has no description',
    /**
     * A WebRTC description without a DTLS fingerprint was given an identity, which signs the
     * fingerprints. This is a bug in the caller.
     */
    UnsignableDescription: 'An SDP description without a fingerprint cannot be signed',
    /** A peer sent an empty NetherNet segment, so it is malformed. */
    EmptySegment: 'A NetherNet segment needs a count and at least one byte',
    /** A peer's NetherNet segments arrived out of sequence, so the message is damaged. */
    SegmentOutOfSequence: 'A NetherNet segment says {left} more follow, where {value} were due',
    /** `listen()` was called on a NetherNet server that was closed. */
    ServerIsClosed: 'The NetherNet server is closed',
    /**
     * The `server-udp-ports` setting is malformed. The message is the one Bedrock Dedicated Server
     * gives for the same value.
     */
    InvalidServerUdpPorts: { message: 'server-udp-ports: {message}', base: UdpPortsError },
    /** A NetherNet signal's connection id is not a number, so the signal is malformed. */
    SignalConnectionIdIsNotNumber: 'NetherNet signal connection ID {id} is not a number',
    /**
     * The port allocation strategy picked a port outside its range. This is a bug in the strategy.
     */
    PortStrategyOutOfRange: { message: 'The strategy picked {port}, outside {start}-{end}', base: RangeError },
    /**
     * A LAN discovery datagram has a type this server does not know, such as one from a newer
     * Minecraft.
     */
    UnknownDiscoveryPacketType: 'Unknown discovery packet type {type}',
    /**
     * A NetherNet signal has a type this server does not know, such as one from a newer Minecraft.
     */
    UnknownNethernetSignalType: 'Unknown NetherNet signal type {type}',
    /**
     * A LAN advertisement uses a layout version this client does not read, such as one from a newer
     * Minecraft.
     */
    UnsupportedLanAdvertisementVersion: 'Unsupported LAN advertisement version {version}',
    /** A call into the native NetherNet library failed. The message is the library's error followed by what it logged during the call; the cause is the original error. */
    NativeCallFailed: '{message}: {log}',
    /** The NetherNet server refused the join offer with that HTTP status and no explanation. */
    JoinRefused: { message: 'The server refused the offer with HTTP {status}', base: JoinRefusedError },
    /**
     * The NetherNet server refused the join offer, with that HTTP status and its own explanation.
     */
    JoinRefusedWithBody: { message: 'The server refused the offer with HTTP {status}: {body}', base: JoinRefusedError },
    /**
     * A request to the signaling server named no network id, or one too long. The server answers
     * 400.
     */
    ExpectedJoinPath: { message: 'Expected /v1/join/<networkId>', base: RefusedRequest },
    /** A join request's WebRTC offer is larger than the server accepts. The server answers 413. */
    SdpOfferTooLarge: { message: 'SDP offer is too large', base: RefusedRequest },
    /** A join request had an empty body where the WebRTC offer belongs. The server answers 400. */
    MissingSdpOffer: { message: 'Missing SDP offer in request body', base: RefusedRequest }
});
