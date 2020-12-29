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
        if (player.runtimeId !== packet.entityId) {
            server
                .getLogger()
                .debug(`${packet.entityId} doesn't match ${player.runtimeId}`);
            return;
        }

        const flying = packet.getFlag(AdventureSettingsFlags.Flying);
        if (flying !== player.isFlying()) {
            await player.setFlying(flying);
        }
    }
}
