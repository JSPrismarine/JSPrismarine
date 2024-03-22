import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import PacketViolationWarningPacket from '../packet/PacketViolationWarningPacket';
import { PlayerSession } from '@';
import Server from '../../Server';

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
