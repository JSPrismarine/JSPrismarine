import type InteractPacket from '../packet/InteractPacket';
import { InteractAction } from '../packet/InteractPacket';

import ContainerOpenPacket from '../packet/ContainerOpenPacket';
import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';
import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Vector3 from '../../math/Vector3';

export default class InteractHandler implements PacketHandler<InteractPacket> {
    public static NetID = Identifiers.InteractPacket;

    public async handle(packet: InteractPacket, server: Server, session: PlayerSession): Promise<void> {
        switch (packet.action) {
            case InteractAction.LeaveVehicle:
            case InteractAction.MouseOver:
                break;
            case InteractAction.OpenInventory: {
                const player = session.getPlayer();
                const pk = new ContainerOpenPacket();
                pk.windowId = player.getInventory().getId();
                pk.containerType = -1; // -> inventory (TODO)
                pk.containerPos = new Vector3(player.getX(), player.getY(), player.getZ());
                pk.containerEntityId = player.getRuntimeId();
                await session.getConnection().sendDataPacket(pk);
                break;
            }
            default:
                server.getLogger().verbose(`Unknown interact action id ${packet.action}`);
        }
    }
}
