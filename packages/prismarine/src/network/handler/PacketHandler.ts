import type DataPacket from '../packet/DataPacket';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default interface PacketHandler<T extends DataPacket> {
    /**
     * Handle a data packet.
     * @param packet Instance of packet we need to handle
     * @param server The server instance
     * @param connection The player connection
     */
    handle(packet: T, server: Server, player: Player): Promise<void> | void;
}
