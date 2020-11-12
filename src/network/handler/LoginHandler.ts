import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import Identifiers from '../Identifiers';
import type LoginPacket from '../packet/LoginPacket';
import ResourcePacksInfoPacket from '../packet/ResourcePacksInfoPacket';
import PlayStatus from '../type/play-status';

export default class LoginHandler {
    static NetID = Identifiers.LoginPacket;

    static handle(packet: LoginPacket, server: Prismarine, player: Player) {
        player.username.name = packet.displayName;
        player.locale = packet.languageCode;
        player.randomId = packet.clientRandomId;
        player.uuid = packet.identity;
        player.xuid = packet.XUID;

        player.skin = packet.skin;
        player.device = packet.device;

        player.getConnection().sendPlayStatus(PlayStatus.LoginSuccess);

        const reason = server.getBanManager().isBanned(player);
        if (reason !== false) {
            player.kick(
                `You have been banned${reason ? ` for reason: ${reason}` : ''}!`
            );
            return;
        }

        let pk = new ResourcePacksInfoPacket();
        player.getConnection().sendDataPacket(pk);
    }
}
