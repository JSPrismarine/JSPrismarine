import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';
import AdventureSettingsPacket, {
    AdventureSettingsFlags
} from '../packet/AdventureSettingsPacket';

export default class AdventureSettingsHandler
    implements PacketHandler<AdventureSettingsPacket> {
    public async handle(
        packet: AdventureSettingsPacket,
        server: Server,
        player: Player
    ): Promise<void> {
        if (player.runtimeId !== packet.entityId && !player.isOp()) {
            return;
        }

        const target = server.getPlayerById(packet.entityId);
        if (!target) return;

        const flying = packet.getFlag(AdventureSettingsFlags.Flying);
        if (flying !== target.isFlying()) {
            await target.setFlying(flying);
        }

        if (player.isOp()) {
            const operator = packet.getFlag(AdventureSettingsFlags.Operator);

            await server
                .getPermissionManager()
                .setOp(target.getUsername(), operator);
        }
    }
}
