import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import ContainerClosePacket from '../packet/ContainerClosePacket';
import type PacketHandler from './PacketHandler';

export default class ContainerCloseHandler implements PacketHandler<ContainerClosePacket> {
    public static NetID = Identifiers.ContainerClosePacket;

    public async handle(packet: ContainerClosePacket, _server: Server, session: PlayerSession): Promise<void> {
        const pk = new ContainerClosePacket();
        pk.containerId = packet.containerId;
        pk.containerType = packet.containerType;
        pk.serverInitiatedClose = packet.serverInitiatedClose;
        await session.getConnection().sendDataPacket(pk);
    }
}
