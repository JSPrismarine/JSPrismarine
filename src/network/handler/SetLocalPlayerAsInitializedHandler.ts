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
        for (const onlinePlayer of server
            .getOnlinePlayers()
            .filter((p) => !(p == player))) {
            console.log(onlinePlayer);
            onlinePlayer.sendSpawn(player);
            player.sendSpawn(onlinePlayer);
        }
    }
}
