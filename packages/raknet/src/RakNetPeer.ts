import type { RemoteInfo } from 'node:dgram';
import type Session from './Session';
import type Packet from './protocol/Packet';

/**
 * The logging surface RakNet uses.
 *
 * Structural rather than an import of `@jsprismarine/logger`: this package deliberately
 * depends on nothing but `binaryutils`, and anything satisfying these six methods - the
 * real logger, a test double, a console - can drive it.
 */
export type Logger = {
    info: Function;
    warn: Function;
    error: Function;
    verbose: Function;
    debug: Function;
    silly: Function;
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
    sendPacket<T extends Packet>(packet: T, rinfo: RemoteInfo): void;

    emit(event: string | symbol, ...args: any[]): boolean;

    /**
     * The session has finished disconnecting and should be forgotten. Called exactly once
     * per session, from {@link Session.disconnect}.
     */
    removeSession(session: Session, reason?: string): void;
}
