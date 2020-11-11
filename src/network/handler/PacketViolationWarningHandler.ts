import Player from '../../player/Player';
import Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import PacketViolationWarningPacket from '../packet/PacketViolationWarningPacket';

export default class PacketViolationWarningHandler {
    static NetID = Identifiers.PacketViolationWarningPacket;

    static handle(
        packet: PacketViolationWarningPacket,
        server: Prismarine,
        player: Player
    ) {
        server
            .getLogger()
            .error(
                `Packet violation: Type: ${packet.type}, Level: ${
                    packet.severity
                }, Packet: 0x${packet.packetId.toString(26)}, Message: ${
                    packet.message
                }!`
            );
    }
}
