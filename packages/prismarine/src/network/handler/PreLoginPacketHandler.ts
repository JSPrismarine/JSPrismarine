import type ClientConnection from '../ClientConnection';
import type { DataPacket } from '../Packets';
import type { Server } from '../../';
import type PacketHandler from './PacketHandler';

/**
 * Handles a packet that arrives before the connection has a player session.
 *
 * Such a handler receives the raw `ClientConnection` instead of a `PlayerSession`. The
 * `preLogin` marker lets the server tell the two handler kinds apart at runtime, see
 * {@link isPreLoginHandler}.
 */
export default interface PreLoginPacketHandler<T extends DataPacket> {
    /** Marks the handler as one that runs before login. */
    readonly preLogin: true;

    handle(packet: T, server: Server, connection: ClientConnection): Promise<void>;
}

/**
 * Returns true when the handler expects a `ClientConnection` rather than a `PlayerSession`.
 */
export const isPreLoginHandler = (
    handler: PacketHandler<any> | PreLoginPacketHandler<any>
): handler is PreLoginPacketHandler<any> => {
    return 'preLogin' in handler && handler.preLogin === true;
};
