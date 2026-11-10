import type { RemoteInfo } from 'node:dgram';
import type Session from './Session';
import type Packet from './protocol/Packet';
import type Frame from './protocol/Frame';
import type { ServerName } from './utils/ServerName';
import type InetAddress from './utils/InetAddress';

/**
 * The logging surface RakNet uses.
 *
 * Structural rather than an import of `@jsprismarine/logger`: this package deliberately
 * depends on nothing but `binaryutils`, and anything satisfying these six methods - the
 * real logger, a test double, a console - can drive it.
 */
export type Logger = {
    info: (...message: string[]) => void;
    warn: (...message: string[]) => void;
    error: (...message: string[]) => void;
    verbose: (...message: string[]) => void;
    debug: (...message: string[]) => void;
    silly: (...message: string[]) => void;
};

/**
 * Everything a {@link Session} needs from whatever owns its socket.
 *
 * The reliability layer is written entirely in terms of "the peer that carries my
 * datagrams" and never asks whether that peer is accepting connections or making one. That
 * distinction lives in {@link Session}'s handshake branch and nowhere else, so the same
 * ACK/NACK, ordering, fragmentation and retransmission code serves both roles.
 *
 * The surface is four members wide, which is the whole point: `@jsprismarine/client` used
 * to drive a session by passing itself as `this as any` in place of a `ServerSocket`,
 * because there was no smaller contract to implement. There is now.
 */
export interface RakNetPeer {
    getLogger(): Logger;

    /**
     * Encodes and sends a packet to `rinfo`. Sessions never touch a socket directly - a
     * closed or unbound one has to be the peer's problem, since only the peer knows.
     */
    sendPacket(packet: Packet, rinfo: RemoteInfo): void;

    emit(event: string | symbol, ...args: any[]): boolean;

    /**
     * The session has finished disconnecting and should be forgotten. Called exactly once
     * per session, from {@link Session.disconnect}.
     */
    removeSession(session: Session, reason?: string): void;
}

/** The server-facing RakNet API shared by the socket and worker-backed implementations. */
export interface RakNetListenerLike extends RakNetPeer {
    readonly serverName: ServerName;

    start(address: string, port: number): void;
    kill(): void;
    allowIncomingConnections(): boolean;
    getMaxConnections(): number;
    setMaxConnections(allowed: number): void;
    getSessions(): Session[];
    getSessionByAddress(rinfo: RemoteInfo): Session | null;
    getSessionByGUID(guid: bigint): Session | null;
    getServerGuid(): bigint;
    sendBuffer(buffer: Buffer, rinfo: RemoteInfo): void;
    on(event: 'openConnection', listener: (session: Session) => void): this;
    on(event: 'closeConnection', listener: (address: InetAddress, reason: string) => void): this;
    on(event: 'encapsulated', listener: (frame: Frame, address: InetAddress) => void): this;
    on(event: 'raw', listener: (buffer: Buffer, address: InetAddress) => void): this;
    /** The socket could not bind, so the listener has stopped. */
    on(event: 'error', listener: (error: Error) => void): this;
}
