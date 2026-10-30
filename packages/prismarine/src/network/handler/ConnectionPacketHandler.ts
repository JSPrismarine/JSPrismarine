import type ClientConnection from '../ClientConnection';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { Server } from '../../';
import type { SessionPhase } from '../SessionPhase';
import type PacketHandler from './PacketHandler';

/**
 * Handles a packet that arrives before the connection has a player session.
 *
 * Such a handler receives the raw `ClientConnection` instead of a `PlayerSession`, and its
 * {@link phases} name only phases in which no session exists yet - `handshake` and `login` -
 * which is how {@link takesConnection} tells the two handler kinds apart at runtime.
 */
export default interface ConnectionPacketHandler<T extends NetworkPacket<unknown>> {
    /** The session phases in which the packet is accepted; both run before a session exists. */
    readonly phases: readonly SessionPhase[];

    handle(packet: T, server: Server, connection: ClientConnection): Promise<void>;
}

/**
 * Returns true when the handler expects a `ClientConnection` rather than a `PlayerSession`.
 *
 * Derived from the handler's declared phases: a session is attached when a connection leaves
 * the `login` phase, so a handler whose phases all precede that point is one written against
 * the bare connection.
 */
export const takesConnection = (
    handler: PacketHandler<any> | ConnectionPacketHandler<any>
): handler is ConnectionPacketHandler<any> => {
    return handler.phases.every((phase) => phase === 'handshake' || phase === 'login');
};
