import type Player from '../../player/Player';
import type Prismarine from '../../Prismarine';
import type LoginPacket from '../packet/login';

const Identifiers = require('../Identifiers').default;
const ResourcePacksInfoPacket = require('../packet/resource-packs-info');
const PlayStatus = require('../type/play-status');

export default class LoginHandler {
    static NetID = Identifiers.LoginPacket;

    /**
     * @param {LoginPacket} packet
     * @param {Prismarine} _server
     * @param {Player} player
     */
    static handle(packet: LoginPacket, server: Prismarine, player: Player) {
        player.username.name = packet.displayName;
        player.locale = packet.languageCode;
        player.randomId = packet.clientRandomId;
        player.uuid = packet.identity;
        player.xuid = packet.XUID;

        player.skin = packet.skin;
        player.device = packet.device;

        player.getPlayerConnection().sendPlayStatus(PlayStatus.LoginSuccess);

        const reason = server.getBanManager().isBanned(player);
        if (reason !== false) {
            player.kick(
                `You have been banned${reason ? ` for reason: ${reason}` : ''}!`
            );
            return;
        }

        let pk = new ResourcePacksInfoPacket();
        player.getPlayerConnection().sendDataPacket(pk);
    }
}
