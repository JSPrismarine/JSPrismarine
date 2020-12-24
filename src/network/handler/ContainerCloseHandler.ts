import ContainerClosePacket from '../packet/ContainerClosePacket';
import type Player from '../../player/Player';
import type Server from '../../Server';

export default class ContainerCloseHandler {
    public handle(
        packet: ContainerClosePacket,
        server: Server,
        player: Player
    ): void {
        const pk = new ContainerClosePacket();
        pk.windowId = packet.windowId;
        player.getConnection().sendDataPacket(pk);

        // TODO: event
    }
}
