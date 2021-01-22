import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';
import type SetLocalPlayerAsInitializedPacket from '../packet/SetLocalPlayerAsInitializedPacket';

export default class SetLocalPlayerAsInitializedHandler
    implements PacketHandler<SetLocalPlayerAsInitializedPacket> {
    // Login packet must be handled sync, if it takes longer to be handled
    // uuid may result null here probably... (response to a issue)
    public async handle(
        packet: SetLocalPlayerAsInitializedPacket,
        server: Server,
        player: Player
    ): Promise<void> {
        // Summon player(s)
        await Promise.all(
            server
                .getPlayerManager()
                .getOnlinePlayers()
                .filter((p) => !(p === player))
                .map(async (p) => {
                    await p.getConnection().sendSpawn(player);
                    await player.getConnection().sendSpawn(p);
                })
        );

        // Summon entities
        await Promise.all(
            player
                .getWorld()
                .getEntities()
                .map(async (entity) => entity.sendSpawn(player))
        );
    }
}
