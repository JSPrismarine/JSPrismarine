import { JSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { defineErrors } from './defineErrors';

/** A command-line input mistake that should exit with status 2. */
export abstract class UsageError extends JSPrismarineError {
    public override name = 'UsageError';
}

/** The errors `@jsprismarine/client` throws. */
export const ClientErrors = defineErrors('client', {
    /**
     * `connect()` was called on a client that is already connected. Make a new client for each
     * connection.
     */
    AlreadyConnected: 'Already connected',
    /**
     * A bot behavior asked to pick from an empty list, such as a wander target when there is
     * nowhere to go.
     */
    PickFromEmptyList: 'Cannot pick from an empty list',
    /** A duration option is not a number with an optional `ms`, `s`, `m` or `h` unit. */
    InvalidDuration: {
        message: 'Cannot read "{value}" as a duration. Try 30s, 10m, or 500ms.',
        base: UsageError
    },
    /** A rate option is not a number of events per second. */
    InvalidRate: { message: 'Cannot read "{value}" as a rate. Try 5 or 5/s.', base: UsageError },
    /** A packet was sent before the NetherNet connection opened or after it closed. */
    TransportNotConnected: 'Cannot send on a transport that is not connected',
    /** `--count` asks for no bots at all. Give it 1 or more. */
    CountBelowOne: { message: '--count must be at least 1', base: UsageError },
    /** The server disconnected the client during login and said why. */
    DisconnectedByServer: 'Disconnected by the server: {reason}',
    /** The server disconnected the client during login without saying why. Its log says why. */
    DisconnectedByServerWithoutReason: 'Disconnected by the server: no reason given',
    /**
     * The connection closed before the server spawned the client, such as a timeout or a server
     * that stopped.
     */
    DisconnectedDuringLogin: 'Disconnected during login: {reason}',
    /**
     * Nothing at that address answered NetherNet signaling. Check the address and port, and that
     * the server has NetherNet turned on.
     */
    NotNethernetServer: '{host}:{port} does not speak NetherNet',
    /**
     * The server's encryption handshake has no salt, so the client cannot derive the key. The
     * server is not a Bedrock server or is broken.
     */
    HandshakeTokenHasNoSalt: 'The handshake token carries no `salt`',
    /**
     * The server's encryption handshake does not carry its public key, so the client cannot derive
     * the key.
     */
    HandshakeTokenHasNoKey: 'The handshake token carries no `x5u` public key',
    /** The server's encryption handshake is not a JSON web token. */
    HandshakeTokenNotJwt: 'A handshake token has a header and a payload separated by dots',
    /** A command was run without an option it needs. */
    MissingOption: { message: '--{flag} is required', base: UsageError },
    /** The simulated link was given a negative latency. */
    NegativeLinkLatency: { message: 'Link latency must be at least 0 ms, got {latencyMs}', base: RangeError },
    /** The simulated link was given a packet loss outside 0 to 1. */
    InvalidLinkLoss: { message: 'Link loss must be from 0 to 1, got {loss}', base: RangeError },
    /**
     * The server did not get the client through login in time. The stage says which answer never
     * came.
     */
    LoginTimedOut: 'Login timed out at stage {stage}',
    /** A percentage option is not a number from 0 to 100, with or without `%`. */
    InvalidPercentage: {
        message: '{flag} must be a percentage from 0 to 100, got "{value}"',
        base: UsageError
    },
    /** A count option is not a whole, non-negative number. */
    InvalidWholeNumber: { message: '{flag} must be a whole number, got "{value}"', base: UsageError },
    /**
     * The server sent a NetherNet frame that is not a packet batch, so the two sides disagree on
     * the protocol.
     */
    NethernetFrameNotBatch: 'A NetherNet frame must be a batch, got id 0x{payload}',
    /** `--network` names a transport the client does not have. */
    UnknownNetwork: {
        message: '--network must be raknet or nethernet, got "{value}"',
        base: UsageError
    },
    /** A packet from the server ended inside its header, so it is truncated. */
    PacketHeaderTruncated: 'Packet header runs past the end of the buffer',
    /** A packet header from the server is not a valid variable-length integer. */
    PacketHeaderUnterminated: 'Packet header varint did not terminate after 5 bytes',
    /** Two packet classes were registered under the same id. */
    DuplicatePacketId: 'Packet id 0x{id} is already registered to {name}',
    /** The server has no room for another player. */
    ServerFull: 'The server refused the login: the server is full',
    /**
     * The server runs an older Minecraft version than the client; use a client protocol the server
     * supports.
     */
    ServerOutdated: 'The server refused the login: the server is out of date',
    /**
     * The server runs a newer Minecraft version than the client; use a protocol the server
     * supports.
     */
    ClientOutdated: 'The server refused the login: this client is out of date',
    /**
     * The server refused the login with a status the client does not name. The server's log says
     * why.
     */
    LoginRefused: 'The server refused the login with status {status}',
    /**
     * The server said the client may spawn before it described the world, which a working server
     * never does.
     */
    SpawnedWithoutStartGame: 'The server spawned us without ever sending StartGame',
    /**
     * The client was asked to speak a protocol version it does not implement. The message lists the
     * ones it does.
     */
    UnsupportedProtocol: 'This client speaks protocol {protocols}, not {protocolVersion}',
    /** A simulated network link was set up twice in one process. Set it up once. */
    LinkAlreadyConditioned: 'This process is already sending over a conditioned link',
    /** A bot was given a behavior name that does not exist. The message lists the ones that do. */
    UnknownBehavior: 'Unknown behavior "{name}". Known behaviors: {behaviorNames}',
    /** The client's command line could not be read. Run it with `--help` for the options. */
    InvalidCommandLineArguments: { message: 'Invalid command-line arguments', base: UsageError },
    /** The command-line parser refused the arguments; the message is its own. */
    CommandLineRejected: { message: '{reason}', base: UsageError },
    /**
     * The NetherNet data channel did not open in time, usually because a firewall or NAT blocks the
     * UDP traffic WebRTC needs.
     */
    NethernetConnectionTimedOut: 'NetherNet connection did not open within {timeoutMs} ms',
    /**
     * The NetherNet connection failed before it opened. The reason is what the WebRTC layer
     * reported.
     */
    NethernetConnectionFailed: 'NetherNet connection failed: {reason}',
    /**
     * A Java Edition server sent a packet at a point of the conversation that has no place for it,
     * such as a status answer that is not the one asked for. The server speaks the protocol
     * differently than this client reads it.
     */
    UnexpectedJavaPacket: 'Expected {expected} in the {phase} phase, got packet {id}',
    /**
     * A Java Edition server sent a packet id the client has no layout for in that phase, so it cannot
     * read the rest of the conversation. The server speaks another release than the client.
     */
    UnknownJavaPacket: 'No {phase} packet has id {id} in Java Edition {release}',
    /**
     * A Java Edition server in online mode asked the client to log in through Mojang's session
     * server, and the client was made without a `joinSession` to do it. Pass one, or join a server
     * with `online-mode` off.
     */
    JavaSessionJoinRequired: 'The server is in online mode, and this client has no session to join it with',
    /**
     * The Java Edition server sent a frame that is longer than any frame may be or ends inside its
     * length. The connection is closed.
     */
    JavaFrameMalformed: 'The server sent {malformed}'
});
