import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import type SetLocalPlayerAsInitializedPacket from '../packet/SetLocalPlayerAsInitializedPacket';

export default class SetLocalPlayerAsInitializedHandler {
    static NetID = Identifiers.SetLocalPlayerAsInitializedPacket;

    static async handle(
        packet: SetLocalPlayerAsInitializedPacket,
        server: Prismarine,
        player: Player
    ) {
        for (let onlinePlayer of server.getOnlinePlayers()) {
            if (onlinePlayer === player) continue;
            onlinePlayer.getConnection().sendSpawn(player);
            player.getConnection().sendSpawn(onlinePlayer);
        }
    }
}
