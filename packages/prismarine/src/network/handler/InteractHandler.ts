import InteractPacket, { InteractAction } from '../packet/InteractPacket';

import ContainerOpenPacket from '../packet/ContainerOpenPacket';
import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';
import Vector3 from '../../math/Vector3';

export default class InteractHandler implements PacketHandler<InteractPacket> {
    public static NetID = Identifiers.InteractPacket;

    public async handle(packet: InteractPacket, server: Server, player: Player): Promise<void> {
        switch (packet.action) {
            case InteractAction.LeaveVehicle:
            case InteractAction.MouseOver:
                break;
            case InteractAction.OpenInventory: {
                const pk = new ContainerOpenPacket();
                pk.windowId = 0; // TODO
                pk.containerType = -1; // -> inventory (TODO)
                pk.containerPos = new Vector3(player.getX(), player.getY(), player.getZ());
                pk.containerEntityId = player.runtimeId;
                await player.getConnection().sendDataPacket(pk);
                break;
            }
            default:
                server.getLogger().debug(`Unknown interact action id ${packet.action}`, 'InteractHandler/handle');
        }
    }
}
