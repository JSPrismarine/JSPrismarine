import PacketHandler from './PacketHandler';
import PacketViolationWarningPacket from '../packet/PacketViolationWarningPacket';
import Player from '../../player/Player';
import Server from '../../Server';

export default class PacketViolationWarningHandler implements PacketHandler<PacketViolationWarningPacket> {
    public handle(packet: PacketViolationWarningPacket, server: Server, player: Player): void {
        server.getLogger().error(`Packet violation 0x${packet.packetId.toString(16)}. ${packet.message}`);
    }
}
