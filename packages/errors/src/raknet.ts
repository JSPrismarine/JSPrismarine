import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/raknet` throws. */
export const RaknetErrors = defineErrors('raknet', {
    /**
     * `connect()` was called on a RakNet client socket that is already connecting or connected. Use
     * one socket per connection.
     */
    AlreadyConnected: 'Already connecting or connected; use a ClientSocket per connection',
    /** `connect()` was called on a RakNet client socket that was closed. */
    ClientSocketClosed: 'Cannot connect on a killed ClientSocket',
    /** `connect()` was called on a loopback socket that was closed. */
    LoopbackSocketClosed: 'Cannot connect on a killed LoopbackSocket',
    /** `ping()` was called on a RakNet client socket that was closed. */
    PingOnClosedSocket: 'Cannot ping on a killed ClientSocket',
    /**
     * A packet was sent after the RakNet worker stopped, which happens while the server shuts down.
     */
    SendOnStoppedWorker: 'Cannot send through a stopped RakNet worker',
    /** A RakNet worker socket was started after it was stopped. Make a new one. */
    StartStoppedWorkerSocket: 'Cannot start a stopped Worker RakNet socket',
    /** The RakNet client socket was closed while a connection or ping was still waiting. */
    ClientSocketKilled: 'ClientSocket was killed',
    /**
     * The server refused the RakNet connection and said why, such as an incompatible protocol
     * version.
     */
    ConnectionRefused: 'Connection refused: {reason}',
    /**
     * The server did not answer the RakNet handshake in time. Check the address and port, and that
     * UDP traffic reaches it.
     */
    ConnectionTimedOut: 'Connection to {address}:{port} timed out',
    /**
     * A datagram was built with more frames than RakNet allows in one. This is a bug in the sender.
     */
    TooManyFramesInDatagram: 'Datagram holds more than {maxFramesPerDatagram} frames',
    /** The connection closed before the RakNet handshake finished. */
    DisconnectedBeforeHandshakeCompleted: 'Disconnected before the handshake completed: {reason}',
    /** A peer sent a fragment whose index is past its fragment count, so the frame is malformed. */
    InvalidFragmentIndex: 'Invalid Frame fragment index={fragmentIndex}, count={fragmentSize}',
    /** A peer sent a frame with no payload, so it is malformed. */
    InvalidFrameLength: 'Invalid Frame length={length}',
    /** An address was written as IPv4 but is not one. */
    InvalidIpv4Address: 'Invalid IPv4 address: {address}',
    /** An address was written as IPv6 but is not one. */
    InvalidIpv6Address: 'Invalid IPv6 address: {text}',
    /**
     * The in-process loopback connection did not finish its handshake in time. This is a bug in the
     * loopback socket or the test that drives it.
     */
    LoopbackHandshakeTimedOut: 'Loopback handshake timed out',
    /** The server did not answer a RakNet ping in time. */
    PingTimedOut: 'Ping to {token} timed out',
    /**
     * The server list entry was built for a protocol with no Minecraft version. This is a bug in
     * the protocol table.
     */
    ServerNameWithoutVersion: 'A server name requires a supported Minecraft version!',
    /**
     * The memory the RakNet worker shares with the main thread holds a record longer than the
     * buffer, so the two sides disagree on its layout. This is a bug.
     */
    InvalidRingRecord: {
        message: 'Shared byte ring contains an invalid {length}-byte record',
        base: RangeError
    },
    /**
     * The shared memory given to the RakNet worker's ring has the wrong size. This is a bug in the
     * worker's setup.
     */
    RingMemoryWrongSize: {
        message: 'Shared byte ring memory has {byteLength} bytes; expected {value}',
        base: RangeError
    },
    /**
     * The RakNet worker's shared ring was given a capacity that is not a power of two between 8
     * bytes and 1 GiB.
     */
    InvalidRingCapacity: {
        message: 'A shared byte ring needs a power-of-two capacity from 8 to 2^30 bytes; got {capacity}',
        base: RangeError
    },
    /** A UDP socket buffer size setting is not a positive whole number. */
    InvalidUdpBufferSize: {
        message: 'UDP {name} buffer size must be a positive safe integer, got {size}',
        base: RangeError
    },
    /**
     * The RakNet worker thread exited, so the server stops accepting players. The log before this
     * line says why.
     */
    WorkerExitedWithCode: 'RakNet worker exited with code {code}',
    /** The RakNet worker module was run as a main thread. Only the server starts it. */
    WorkerHasNoParentPort: 'RakNet worker has no parent port',
    /**
     * The packaged server's embedded RakNet worker was asked for outside a Node single executable.
     * This is a bug in how the packager defined the worker.
     */
    EmbeddedWorkerOutsideExecutable: 'The embedded RakNet worker requires a Node single executable',
    /** A RakNet worker socket was started twice. */
    WorkerSocketAlreadyStarted: 'Worker RakNet socket has already been started',
    /** Code waited for a RakNet worker socket that was never started. */
    WorkerSocketNotStarted: 'Worker RakNet socket has not been started',
    /**
     * The RakNet worker started with options that are not the shape the server sends. This is a bug
     * in the worker's setup.
     */
    WorkerReceivedInvalidStartupData: { message: 'RakNet worker received invalid startup data', base: TypeError },
    /** The RakNet worker thread failed. The message is the worker's own. */
    WorkerFailed: '{message}',
    /**
     * The server queued more outgoing data for the RakNet worker than the shared buffer holds, so
     * the worker fell behind. Raise the buffer size or lower the load.
     */
    WorkerQueueIsFull: 'RakNet worker queue is full ({queuedBytes}/{capacity} bytes queued)'
});
