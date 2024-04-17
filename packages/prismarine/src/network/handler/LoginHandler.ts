import { Player } from '../../';
import type Server from '../../Server';
import type ClientConnection from '../ClientConnection';
import Identifiers from '../Identifiers';
import { PlayStatusPacket } from '../Packets';
import type LoginPacket from '../packet/LoginPacket';
import ResourcePacksInfoPacket from '../packet/ResourcePacksInfoPacket';
import PlayStatusType from '../type/PlayStatusType';
import type PreLoginPacketHandler from './PreLoginPacketHandler';

export default class LoginHandler implements PreLoginPacketHandler<LoginPacket> {
    public static NetID = Identifiers.LoginPacket;

    /**
     * @TODO: Check if player count >= max players
     * @TODO: encryption handshake.
     */
    public async handle(packet: LoginPacket, server: Server, connection: ClientConnection): Promise<void> {
        const playStatus = new PlayStatusPacket();

        // Kick client if has newer / older client version
        if (packet.protocol !== Identifiers.Protocol) {
            playStatus.status =
                packet.protocol < Identifiers.Protocol
                    ? PlayStatusType.LoginFailedClient
                    : PlayStatusType.LoginFailedServer;
            await connection.sendDataPacket(playStatus, true);
            return;
        }

        // Kick the player if their username is invalid
        if (!packet.displayName) {
            connection.disconnect('Invalid username!', false);
            return;
        }

        const player = new Player({
            connection,
            world: server.getWorldManager().getDefaultWorld()!,
            server,
            uuid: packet.identity
        });

        player.setName(packet.displayName);
        player.xuid = packet.XUID;
        player.randomId = packet.clientRandomId;
        player.locale = packet.languageCode;
        player.skin = packet.skin;
        player.device = packet.device;

        // Player with same name or xuid is already connected,
        // so kick the old player and let the new player connect.
        await server
            .getSessionManager()
            .findPlayer({ name: packet.displayName, xuid: packet.XUID })
            ?.kick('Logged in from another location');

        if (!player.xuid && server.getConfig().getOnlineMode()) {
            await player.kick('Server is in online-mode!');
            return;
        }

        const reason = server.getBanManager().isBanned(player);
        if (reason !== false) {
            await player.kick(`You have been banned${reason ? ` for reason: ${reason}` : ''}!`);
            return;
        }

        await player.enable();

        // Update the player connection to be recognized as a connected player
        const session = connection.initPlayerConnection(server, player);
        await session.sendPlayStatus(PlayStatusType.LoginSuccess);

        // Finalize connection handshake
        const resourcePacksInfo = new ResourcePacksInfoPacket();
        resourcePacksInfo.resourcePackRequired = false;
        resourcePacksInfo.forceServerPacksEnabled = false;
        resourcePacksInfo.hasScripts = false;
        resourcePacksInfo.hasAddonPacks = false;
        await connection.sendDataPacket(resourcePacksInfo, true);
    }
}
