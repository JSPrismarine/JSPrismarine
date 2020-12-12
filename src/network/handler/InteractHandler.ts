import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import InteractPacket, { InteractAction } from '../packet/InteractPacket';
import ContainerOpenPacket from '../packet/ContainerOpenPacket';
import Vector3 from '../../math/Vector3';
import PacketHandler from './PacketHandler';

export default class InteractHandler implements PacketHandler<InteractPacket> {
    public handle(
        packet: InteractPacket,
        server: Prismarine,
        player: Player
    ): void {
        switch (packet.action) {
            case InteractAction.LeaveVehicle:
            case InteractAction.MouseOver:
                break;
            case InteractAction.OpenInventory:
                let pk = new ContainerOpenPacket();
                pk.windowId = 0; // TODO
                pk.containerType = -1; // -> inventory (TODO)
                pk.containerPos = new Vector3(
                    player.getX(),
                    player.getY(),
                    player.getZ()
                );
                pk.containerEntityId = player.runtimeId;
                player.getConnection().sendDataPacket(pk);
                break;
            default:
                server
                    .getLogger()
                    .debug('Unknown interact action id=%d', packet.action);
        }
    }
}
