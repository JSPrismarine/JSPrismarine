import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import AnimatePacket from '../packet/AnimatePacket';
import Identifiers from '../Identifiers';

export default class AnimateHandler {
    static NetID = Identifiers.AnimatePacket;

    static handle(packet: AnimatePacket, server: Prismarine, player: Player) {
        let pk = new AnimatePacket();
        pk.runtimeEntityId = player.runtimeId;
        pk.action = packet.action;

        for (let onlinePlayer of server.getOnlinePlayers()) {
            if (onlinePlayer === player) continue;
            onlinePlayer.getPlayerConnection().sendDataPacket(pk);
        }
    }
}
