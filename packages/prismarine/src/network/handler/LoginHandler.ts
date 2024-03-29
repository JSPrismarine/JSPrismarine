import type ClientConnection from '../ClientConnection';
import Identifiers from '../Identifiers';
import { PlayStatusPacket } from '../Packets';
import PlayStatusType from '../type/PlayStatusType';
import { Player } from '../../';
import type PreLoginPacketHandler from './PreLoginPacketHandler';
import ResourcePacksInfoPacket from '../packet/ResourcePacksInfoPacket';
import type Server from '../../Server';
import { LoginPacket } from '@jsprismarine/protocol';

export default class LoginHandler implements PreLoginPacketHandler<LoginPacket> {
    public static NetID = Identifiers.LoginPacket;

    public async handle(packet: LoginPacket, server: Server, connection: ClientConnection): Promise<void> {
        // TODO: Check if player count >= max players

        const playStatus = new PlayStatusPacket();

        // Kick client if has newer / older client version
        if (packet.clientNetworkVersion !== Identifiers.Protocol) {
            playStatus.status =
                packet.clientNetworkVersion < Identifiers.Protocol
                    ? PlayStatusType.LoginFailedClient
                    : PlayStatusType.LoginFailedServer;
            await connection.sendDataPacket(playStatus, true);
            return;
        }

        // Kick the player if their username is invalid
        /* if (!packet.displayName) {
            connection.disconnect('Invalid username!', false);
            return;
        }

        // TODO: get rid of this trash
        const world = server.getWorldManager().getDefaultWorld()!;
        const player = new Player(connection, world, server);
        player.username.name = packet.displayName;
        player.locale = packet.languageCode;
        player.randomId = packet.clientRandomId;
        player.uuid = packet.identity;
        player.xuid = packet.XUID;
        player.skin = packet.skin;
        player.device = packet.device; 

        // Player with same name is already online
        try {
            const oldPlayer = server.getSessionManager().getPlayerByExactName(packet.displayName);
            await oldPlayer.kick('Logged in from another location');
        } catch {}

        if (!player.xuid && server.getConfig().getOnlineMode()) {
            await player.kick('Server is in online-mode!');
            return;
        }

        await player.onEnable();

        // TODO: encryption handshake

        const reason = server.getBanManager().isBanned(player);
        if (reason !== false) {
            await player.kick(`You have been banned${reason ? ` for reason: ${reason}` : ''}!`);
            return;
        }

        // Update the player connection to be recognized as a connected player
        const session = connection.initPlayerConnection(server, player);
        await session.sendPlayStatus(PlayStatusType.LoginSuccess);

        await world.addEntity(player);

        // Finalize connection handshake
        const resourcePacksInfo = new ResourcePacksInfoPacket();
        resourcePacksInfo.resourcePackRequired = false;
        resourcePacksInfo.forceServerPacksEnabled = false;
        resourcePacksInfo.hasScripts = false;
        resourcePacksInfo.hasAddonPacks = false;
        await connection.sendDataPacket(resourcePacksInfo, true); */
    }
}
