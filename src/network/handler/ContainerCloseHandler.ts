import ContainerClosePacket from '../packet/ContainerClosePacket';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default class ContainerCloseHandler {
    public async handle(
        packet: ContainerClosePacket,
        server: Server,
        player: Player
    ): Promise<void> {
        const pk = new ContainerClosePacket();
        pk.windowId = packet.windowId;
        await player.getConnection().sendDataPacket(pk);
    }
}
