import type { PlayerSession } from '../../';
import type Server from '../../Server';

export default interface PacketHandler<T extends object> {
    /**
     * Handle a data packet.
     * @param data - Decoded packet data
     * @param server - The server instance
     * @param session - The player session
     */
    handle(data: T, server: Server, session: PlayerSession): Promise<void> | void;

    // Maybe the ideal would be to: server.getPlayer(connection.getAddress().toToken())
    // or maybe to set player as a map<connection => player>.
    // I had to do this mess because here i want to handle mainly network stuff.
}
