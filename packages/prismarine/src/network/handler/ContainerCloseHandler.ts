import ContainerClosePacket from '../packet/ContainerClosePacket';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerConnection } from '../../Prismarine';
import type Server from '../../Server';

export default class ContainerCloseHandler implements PacketHandler<ContainerClosePacket> {
    public static NetID = Identifiers.ContainerClosePacket;

    public async handle(packet: ContainerClosePacket, _server: Server, connection: PlayerConnection): Promise<void> {
        const pk = new ContainerClosePacket();
        pk.windowId = packet.windowId;
        await connection.sendDataPacket(pk);
    }
}
