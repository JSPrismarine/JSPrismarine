import Player from '../../player/Player';
import Prismarine from '../../Prismarine';
import DataPacket from '../packet/DataPacket';

export default interface PacketHandler<T extends DataPacket> {
    /**
     * Handle a data packet.
     * @param packet Instance of packet we need to handle
     * @param server The server instance
     * @param connection The playeer connection
     */
    handle(packet: T, server: Prismarine, player: Player): void;
}
