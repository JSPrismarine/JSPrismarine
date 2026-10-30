import type { PlayerSession } from '../../';
import type Server from '../../Server';
import type NetworkPacket from '@jsprismarine/protocol/NetworkPacket';
import type { SessionPhase } from '../SessionPhase';

export default interface PacketHandler<T extends NetworkPacket<unknown>> {
    /**
     * The session phases in which the packet is accepted. The dispatcher drops the packet in
     * any other phase. A handler that takes a `PlayerSession` can only name phases in which
     * one exists: `resourcePacks` and `play`.
     */
    readonly phases: readonly SessionPhase[];

    /**
     * Handles one decoded packet.
     * @param packet - The packet instance to handle.
     * @param {Server} server - The server instance.
     * @param {PlayerSession} session - The player session.
     * @returns {Promise<void> | void} Handled packet.
     */
    handle(packet: T, server: Server, session: PlayerSession): Promise<void> | void;

    // Maybe the ideal would be to: server.getPlayer(connection.getAddress().toToken())
    // or maybe to set player as a map<connection => player>.
    // I had to do this mess because here i want to handle mainly network stuff.
}
