import ContainerClosePacket from '../packet/ContainerClosePacket';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default class ContainerCloseHandler implements PacketHandler<ContainerClosePacket> {
    public static NetID = Identifiers.ContainerClosePacket;

    public async handle(packet: ContainerClosePacket, server: Server, player: Player): Promise<void> {
        const pk = new ContainerClosePacket();
        pk.windowId = packet.windowId;
        await player.getConnection().sendDataPacket(pk);
    }
}
