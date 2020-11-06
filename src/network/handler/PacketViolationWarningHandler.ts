import Player from '../../player/Player';
import Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import PacketViolationWarningPacket from '../packet/packet-violation-warning';

export default class PacketViolationWarningHandler {
    static NetID = Identifiers.PacketViolationWarningPacket;

    static handle(
        packet: PacketViolationWarningPacket,
        server: Prismarine,
        player: Player
    ) {
        server.getLogger().error(`Packet violation: ${JSON.stringify(packet)}`);
    }
}
