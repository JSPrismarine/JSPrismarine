import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import InteractPacket, { InteractAction } from '../packet/InteractPacket';
import ContainerOpenPacket from '../packet/container-open';

export default class InteractHandler {
    static NetID = Identifiers.InteractPacket;

    static handle(packet: InteractPacket, server: Prismarine, player: Player) {
        switch (packet.action) {
            case InteractAction.LeaveVehicle:
            case InteractAction.MouseOver:
                break;
            case InteractAction.OpenInventory:
                let pk = new ContainerOpenPacket();
                pk.windowId = 92; // TODO
                pk.containerType = -1; // -> inventory (TODO)
                pk.containerX = pk.containerY = pk.containerZ = 0;
                pk.containerEntityId = BigInt(player.runtimeId);
                player.getPlayerConnection().sendDataPacket(pk);
                break;
            default:
                server
                    .getLogger()
                    .debug('Unknown interact action id: ' + packet.action);
        }
    }
}
