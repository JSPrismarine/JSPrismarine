import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import ContainerClosePacket from '../packet/ContainerClosePacket';

export default class ContainerCloseHandler {
    static NetID = Identifiers.ContainerClosePacket;

    static handle(
        packet: ContainerClosePacket,
        server: Prismarine,
        player: Player
    ) {
        let pk = new ContainerClosePacket();
        pk.windowId = packet.windowId;
        player.getConnection().sendDataPacket(pk);

        // TODO: event
    }
}
