import NetworkSettingsPacket, { NetworkCompression } from '../packet/NetworkSettingsPacket';

import ClientConnection from '../ClientConnection';
import Identifiers from '../Identifiers';
import type LoginPacket from '../packet/LoginPacket';
import { PlayStatusPacket } from '../Packets';
import PlayStatusType from '../type/PlayStatusType';
import { Player } from '../../Prismarine';
import PreLoginPacketHandler from './PreLoginPacketHandler';
import ResourcePacksInfoPacket from '../packet/ResourcePacksInfoPacket';
import type Server from '../../Server';

export default class LoginHandler implements PreLoginPacketHandler<LoginPacket> {
    public static NetID = Identifiers.LoginPacket;

    public async handle(packet: LoginPacket, server: Server, connection: ClientConnection): Promise<void> {
        // TODO: Check if player count >= max players

        const playStatus = new PlayStatusPacket();

        // Kick client if has newer / older client version
        if (packet.protocol !== Identifiers.Protocol) {
            playStatus.status = (packet.protocol < Identifiers.Protocol ? PlayStatusType.LoginFailedClient : PlayStatusType.LoginFailedServer);
            connection.sendDataPacket(playStatus);
            return;
        }

        // Kick the player if their username is invalid
        if (!packet.displayName) {
            // TODO: await player.kick('Invalid username!');
            connection.forceDisconnect();
            return;
        }

        // Player with same name is already online
        try {
            const oldPlayer = server.getPlayerManager().getPlayerByExactName(packet.displayName);
            await oldPlayer.kick('Logged in from another location');
        } catch {}

        const raknetSession = connection.getRakNetSession();
        const world = server.getWorldManager().getDefaultWorld();
        const player = new Player(raknetSession, world, server);

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

        // TODO: encryption handshake

        playStatus.status = PlayStatusType.LoginSuccess;
        await connection.sendDataPacket(playStatus);

        const reason = server.getBanManager().isBanned(player);
        if (reason !== false) {
            await player.kick(`You have been banned${reason ? ` for reason: ${reason}` : ''}!`);
            return;
        }

        // Update the player connection to be recognized as a connected player
        const token = raknetSession.getAddress().toToken();
        server.connections.set(token, connection.initPlayerConnection(server, player));
        server.getPlayerManager().addPlayer(token, player)
        world.addEntity(player);        

        // Finalize connection handshake 
        const resourcePacksInfo = new ResourcePacksInfoPacket();
        resourcePacksInfo.mustAccept = false;
        resourcePacksInfo.forceAccept = false;
        resourcePacksInfo.hasScripts = false;
        await connection.sendDataPacket(resourcePacksInfo);

        const networkSettings = new NetworkSettingsPacket();
        networkSettings.compressionThreshold = NetworkCompression.COMPRESS_EVERYTHING;
        await connection.sendDataPacket(networkSettings);
    }
}
