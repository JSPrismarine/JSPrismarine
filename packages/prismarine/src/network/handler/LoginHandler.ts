import { DisconnectReason } from '@jsprismarine/minecraft';
import Player from '../../Player';
import type Server from '../../Server';
import UUID from '../../utils/UUID';
import { Position } from '../../world/Position';
import type ClientConnection from '../ClientConnection';
import { createConnectedPlayer } from '../createConnectedPlayer';
import Identifiers from '../Identifiers';
import { PlayStatusPacket } from '../Packets';
import type LoginPacket from '../packet/LoginPacket';
import ResourcePacksInfoPacket from '../packet/ResourcePacksInfoPacket';
import PlayStatusType from '../type/PlayStatusType';
import type PreLoginPacketHandler from './PreLoginPacketHandler';

export default class LoginHandler implements PreLoginPacketHandler<LoginPacket> {
    public static NetID = Identifiers.LoginPacket;
    public readonly preLogin = true;

    /**
     * Says what was refused and what the login actually carried.
     *
     * "Invalid identity" on its own is a dead end: a login can name a player in four places -
     * the certificate chain, the multiplayer token, a uuid derived from an XUID, and the
     * client data - and which of them a client uses depends on its version and on whether it
     * is signed in. Without this, a refusal says only that all four were empty, and finding
     * out which was supposed to be filled means guessing.
     */
    private static reportRefusal(packet: LoginPacket, server: Server, why: string): void {
        const found = [
            `protocol=${packet.protocol}`,
            `name=${packet.displayName || 'none'}`,
            `identity=${packet.identity || 'none'}`,
            `xuid=${packet.XUID || 'none'}`,
            `key=${packet.identityPublicKey ? 'yes' : 'no'}`
        ].join(' ');

        server.getLogger().warn(`Refused a login: ${why}. The packet carried ${found}`, 'LoginHandler/handle');
    }

    /**
     * Turns a login into a player, or refuses it.
     *
     * A version mismatch and a full server are answered with the matching `PlayStatus`, which
     * is what the client renders as "outdated client", "outdated server" and "server full".
     * Everything else is a `Disconnect` whose `DisconnectReason` names the cause on the
     * client's disconnect screen, with the message shown.
     *
     * Known gap: the server never sends `ServerToClientHandshake`, so sessions stay in
     * plaintext. A client accepts that when no handshake arrives.
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

        // The client renders this status as "server full", so the player learns why without
        // the server building a player it would only tear down again.
        if (server.getSessionManager().getAllPlayers().length >= server.getConfig().getMaxPlayers()) {
            playStatus.status = PlayStatusType.LoginFailedServerFull;
            await connection.sendDataPacket(playStatus, true);
            return;
        }

        // Kick the player if their username is invalid
        if (!packet.displayName) {
            LoginHandler.reportRefusal(packet, server, 'no username');
            await connection.disconnect('Invalid username!', false, DisconnectReason.INVALID_PLAYER);
            return;
        }

        // Rejected rather than replaced. A login carrying no identity used to be handed a
        // freshly generated uuid, which the client had never heard of - so the player went
        // into the player list under an id nothing on the other side could match.
        if (!packet.identity) {
            LoginHandler.reportRefusal(packet, server, 'no identity');
            await connection.disconnect('Invalid identity!', false, DisconnectReason.INVALID_PLAYER);
            return;
        }

        // Resolved here because this is where a world is first available and awaiting is
        // allowed. An entity has to be given somewhere to be, so there is no longer a moment
        // where one exists at the origin waiting to be told where it really is.
        const world = server.getWorldManager().getDefaultWorld();
        const player = new Player({
            position: Position.fromVector3(await world.getSpawnPosition(), world),
            address: connection.getRakNetSession().getAddress(),
            identity: {
                uuid: UUID.fromString(packet.identity),
                name: packet.displayName,
                xuid: packet.XUID,
                randomId: packet.clientRandomId,
                locale: packet.languageCode,
                skin: packet.skin,
                device: packet.device
            }
        });

        // Player with same name or xuid is already connected,
        // so kick the old player and let the new player connect.
        await server
            .getSessionManager()
            .findPlayer({ name: packet.displayName, xuid: packet.XUID })
            ?.kick('Logged in from another location', DisconnectReason.LOGGED_IN_OTHER_LOCATION);

        // Rejected through the connection, not through the player: this one has no session
        // yet and has joined nothing, so `kick` had nothing to send the reason on and
        // `disable` would have announced a departure for somebody who never arrived.
        if (!player.xuid && server.getConfig().getOnlineMode()) {
            await connection.disconnect('Server is in online-mode!', false, DisconnectReason.NOT_AUTHENTICATED);
            return;
        }

        const reason = server.getBanManager().isBanned(player);
        if (reason !== false) {
            await connection.disconnect(
                `You have been banned${reason ? ` for reason: ${reason}` : ''}!`,
                false,
                DisconnectReason.NOT_ALLOWED
            );
            return;
        }

        // Joined to its connection only once it is going to be let in, and torn down as a
        // pair if the join itself fails - otherwise the session would keep its place in the
        // chunk rotation with nothing on the other end of it.
        //
        // `enable` sends nothing. Until the client has `PlayStatus(LoginSuccess)` below it is
        // still logging in, and a retail client handed a game packet in that state drops the
        // connection with `InitialConnection-90`. Nothing but PlayStatus and ResourcePacksInfo
        // leaves here; the rest waits for `ResourcePackClientResponseHandler`.
        const session = createConnectedPlayer({ server, connection, player });
        try {
            await player.enable();
        } catch (error: unknown) {
            await connection.closePlayerSession();
            throw error;
        }

        await session.sendPlayStatus(PlayStatusType.LoginSuccess);

        // Finalize connection handshake
        const resourcePacksInfo = new ResourcePacksInfoPacket();
        resourcePacksInfo.resourcePackRequired = false;
        resourcePacksInfo.hasScripts = false;
        resourcePacksInfo.hasAddonPacks = false;
        await connection.sendDataPacket(resourcePacksInfo, true);
    }
}
