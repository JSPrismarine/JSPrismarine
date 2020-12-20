import InteractPacket, { InteractAction } from '../packet/InteractPacket';

import ContainerOpenPacket from '../packet/ContainerOpenPacket';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';
import Vector3 from '../../math/Vector3';

export default class InteractHandler implements PacketHandler<InteractPacket> {
    public handle(
        packet: InteractPacket,
        server: Server,
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
