import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import type SetLocalPlayerAsInitializedPacket from '../packet/SetLocalPlayerAsInitializedPacket';

export default class SetLocalPlayerAsInitializedHandler {
    static NetID = Identifiers.SetLocalPlayerAsInitializedPacket;

    static async handle(
        _packet: SetLocalPlayerAsInitializedPacket,
        server: Prismarine,
        player: Player
    ) {
        Promise.all(
            server
                .getOnlinePlayers()
                .filter((onlinePlayer) => !(onlinePlayer == player))
                .map((otherOnlinePlayer) => {
                    otherOnlinePlayer.getConnection().sendSpawn(player);
                    player.getConnection().sendSpawn(otherOnlinePlayer);
                })
        );
    }
}
