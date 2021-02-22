import Identifiers from '../Identifiers';
import type LoginPacket from '../packet/LoginPacket';
import PacketHandler from './PacketHandler';
import PlayStatusType from '../type/PlayStatusType';
import type Player from '../../player/Player';
import ResourcePacksInfoPacket from '../packet/ResourcePacksInfoPacket';
import type Server from '../../Server';

export default class LoginHandler implements PacketHandler<LoginPacket> {
    public async handle(packet: LoginPacket, server: Server, player: Player): Promise<void> {
        // TODO: Check if player count >= max players

        // Kick client if has newer / older client version
        if (packet.protocol !== Identifiers.Protocol) {
            if (packet.protocol < Identifiers.Protocol) {
                await player.getConnection().sendPlayStatus(PlayStatusType.LoginFailedClient);
            } else {
                await player.getConnection().sendPlayStatus(PlayStatusType.LoginFailedServer);
            }

            return;
        }

        if (!packet.displayName) {
            await player.kick('Invalid username!');
            return;
        }

        // Player with same name is already online
        try {
            const oldPlayer = server.getPlayerManager().getPlayerByExactName(packet.displayName);
            await oldPlayer.kick('Logged in from another location');
        } catch {}

        player.username.name = packet.displayName;
        player.locale = packet.languageCode;
        player.randomId = packet.clientRandomId;
        player.uuid = packet.identity;
        player.xuid = packet.XUID;

        if (!player.xuid && server?.getConfig?.().getOnlineMode?.()) {
            await player.kick('Server is in online-mode!');
            return;
        }

        player.skin = packet.skin;
        player.device = packet.device;

        await player.onEnable();
        await player.getConnection().sendPlayStatus(PlayStatusType.LoginSuccess);

        const reason = server.getBanManager().isBanned(player);
        if (reason !== false) {
            await player.kick(`You have been banned${reason ? ` for reason: ${reason}` : ''}!`);
            return;
        }

        const pk = new ResourcePacksInfoPacket();
        await player.getConnection().sendDataPacket(pk);
    }
}
