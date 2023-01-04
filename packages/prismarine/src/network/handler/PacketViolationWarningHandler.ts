import Identifiers from '../Identifiers.js';
import PacketHandler from './PacketHandler.js';
import PacketViolationWarningPacket from '../packet/PacketViolationWarningPacket.js';
import { PlayerSession } from '../../Prismarine.js';
import Server from '../../Server.js';

export default class PacketViolationWarningHandler implements PacketHandler<PacketViolationWarningPacket> {
    public static NetID = Identifiers.PacketViolationWarningPacket;

    public handle(packet: PacketViolationWarningPacket, server: Server, _session: PlayerSession): void {
        server
            .getLogger()
            ?.error(
                `Packet violation 0x${packet.packetId.toString(16)}, message: "${packet.message}", type: ${
                    packet.type
                }, severity: ${packet.severity}`
            );
    }
}
