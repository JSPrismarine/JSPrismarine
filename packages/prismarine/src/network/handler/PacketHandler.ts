import type DataPacket from '../packet/DataPacket';
import { PlayerConnection } from '../../Prismarine';
import type Server from '../../Server';

export default interface PacketHandler<T extends DataPacket> {
    /**
     * Handle a data packet.
     * @param packet Instance of packet we need to handle
     * @param server The server instance
     * @param connection The player connection
     */
    handle(packet: T, server: Server, connection: PlayerConnection): Promise<void> | void;

    // Maybe the ideal would be to: server.getPlayer(connection.getAddress().toToken())
    // or maybe to set player as a map<connection => player>.
    // I had to do this mess because here i want to handle mainly network stuff.
}
