import PacketHandler from './PacketHandler';
import type Player from '../../player/Player';
import type Server from '../../Server';
import type SetLocalPlayerAsInitializedPacket from '../packet/SetLocalPlayerAsInitializedPacket';

export default class SetLocalPlayerAsInitializedHandler
    implements PacketHandler<SetLocalPlayerAsInitializedPacket> {
    // Login packet must be handled sync, if it takes longer to be handled
    // uuid may result null here probably... (response to a issue)
    public handle(
        packet: SetLocalPlayerAsInitializedPacket,
        server: Server,
        player: Player
    ): void {
        for (const onlinePlayer of server
            .getOnlinePlayers()
            .filter((p) => !(p == player))) {
            onlinePlayer.getConnection().sendSpawn(player);
            player.getConnection().sendSpawn(onlinePlayer);
        }
    }
}
