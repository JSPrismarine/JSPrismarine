import type InteractPacket from '../packet/InteractPacket';
import { InteractAction } from '../packet/InteractPacket';

import type { PlayerSession } from '../../';
import type Server from '../../Server';
import Identifiers from '../Identifiers';
import type PacketHandler from './PacketHandler';

export default class InteractHandler implements PacketHandler<InteractPacket> {
    public static NetID = Identifiers.InteractPacket;

    public async handle(packet: InteractPacket, server: Server, session: PlayerSession): Promise<void> {
        switch (packet.action) {
            case InteractAction.LeaveVehicle:
            case InteractAction.MouseOver:
                break;
            case InteractAction.OpenInventory:
                await session.openMainInventory();
                break;
            default:
                server.getLogger().verbose(`Unknown interact action id ${packet.action}`);
        }
    }
}
