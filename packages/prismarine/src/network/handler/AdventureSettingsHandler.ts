import AdventureSettingsPacket, { AdventureSettingsFlags } from '../packet/AdventureSettingsPacket';

import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import { PlayerConnection } from '../../Prismarine';
import type Server from '../../Server';

export default class AdventureSettingsHandler implements PacketHandler<AdventureSettingsPacket> {
    public static NetID = Identifiers.AdventureSettingsPacket;

    public async handle(packet: AdventureSettingsPacket, server: Server, connection: PlayerConnection): Promise<void> {
        const player = connection.getPlayer();
        if (player.getRuntimeId() !== packet.entityId && !player.isOp()) {
            return;
        }

        const target = server.getPlayerManager().getPlayerById(packet.entityId);
        if (!target) return;

        const flying = packet.getFlag(AdventureSettingsFlags.Flying);
        if (flying !== target.isFlying()) {
            await target.setFlying(flying);
        }

        if (player.isOp()) {
            const operator = packet.getFlag(AdventureSettingsFlags.Operator);

            await server.getPermissionManager().setOp(target.getName(), operator);
        }
    }
}
