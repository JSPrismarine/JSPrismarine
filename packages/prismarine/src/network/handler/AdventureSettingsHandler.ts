import AdventureSettingsPacket, { AdventureSettingsFlags } from '../packet/AdventureSettingsPacket';

import Identifiers from '../Identifiers';
import PacketHandler from './PacketHandler';
import PlayerSession from '../PlayerSession';
import type Server from '../../Server';

export default class AdventureSettingsHandler implements PacketHandler<AdventureSettingsPacket> {
    public static NetID = Identifiers.AdventureSettingsPacket;

    public async handle(packet: AdventureSettingsPacket, server: Server, session: PlayerSession): Promise<void> {
        const player = session.getPlayer();
        if (player.getRuntimeId() !== packet.entityId && !player.isOp()) {
            return;
        }

        const target = server.getSessionManager().getPlayerById(packet.entityId);
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
