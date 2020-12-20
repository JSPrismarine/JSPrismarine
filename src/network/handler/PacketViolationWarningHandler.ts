import PacketHandler from './PacketHandler';
import PacketViolationWarningPacket from '../packet/PacketViolationWarningPacket';
import Player from '../../player/Player';
import Prismarine from '../../Prismarine';

export default class PacketViolationWarningHandler
    implements PacketHandler<PacketViolationWarningPacket> {
    public handle(
        packet: PacketViolationWarningPacket,
        server: Prismarine,
        player: Player
    ): void {
        server.getLogger().error(`Packet violation: ${JSON.stringify(packet)}`);
    }
}
