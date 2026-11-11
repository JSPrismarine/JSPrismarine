import { DisconnectReason } from '@jsprismarine/minecraft';
import { PlayStatus, PlayStatusPacket } from '@jsprismarine/protocol';
import ServerToClientHandshakePacket from '@jsprismarine/protocol/packet/ServerToClientHandshakePacket';
import { sessionEncryption } from '../SessionEncryption';
import type Server from '../../Server';
import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import { entityIds } from '../../entity/entityIds';
import { EYE_HEIGHT } from '../../entity/playerEyes';
import { StorePlayer } from '../../entity/storePlayer';
import type ClientConnection from '../ClientConnection';
import { createConnectedPlayer } from '../createConnectedPlayer';
import type LoginPacket from '@jsprismarine/protocol/packet/LoginPacket';
import ResourcePacksInfoPacket from '@jsprismarine/protocol/packet/ResourcePacksInfoPacket';
import { identityFromXUID, parseLoginIdentity } from '../LoginIdentity';
import { LoginRefused, verifyLogin } from '@jsprismarine/auth/server';
import type ConnectionPacketHandler from './ConnectionPacketHandler';
import type { PlayerIdentity } from '../../playerIdentity';

type LoginIdentity = ReturnType<typeof parseLoginIdentity>;

/** What a login replacing another session of the same account tells the one it replaces. */
const REPLACED = 'Logged in from another location';

/** The account a login names, in the form `SessionManager` compares. */
const accountOf = (identity: LoginIdentity): PlayerIdentity => ({
    name: identity.displayName,
    xuid: identity.xuid,
    uuid: UUID.fromString(identity.identity).toString()
});

export default class LoginHandler implements ConnectionPacketHandler<LoginPacket> {
    public static PacketName = 'LoginPacket';
    public readonly phases = ['login'] as const;
    // Login I/O stays out of the tick (ADR 0014); admission still reads the world and kicks a duplicate.
    public readonly lane = 'connection';

    /**
     * Says what was refused and what the login actually carried.
     *
     * "Invalid identity" on its own is a dead end: a login can name a player in four places -
     * the certificate chain, the multiplayer token, a uuid derived from an XUID, and the
     * client data - and which of them a client uses depends on its version and on whether it
     * is signed in. Without this, a refusal says only that all four were empty, and finding
     * out which was supposed to be filled means guessing.
     */
    private static reportRefusal(protocolVersion: number, identity: LoginIdentity, server: Server, why: string): void {
        const found = [
            `protocol=${protocolVersion}`,
            `name=${identity.displayName || 'none'}`,
            `identity=${identity.identity || 'none'}`,
            `xuid=${identity.xuid || 'none'}`,
            `key=${identity.identityPublicKey ? 'yes' : 'no'}`
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
     * A login that names an identity key is answered with `ServerToClientHandshake` and
     * finishes in {@link LoginHandler.admit} once the client replies, encrypted unless the
     * transport already encrypts the wire.
     */
    public async handle(packet: LoginPacket, server: Server, connection: ClientConnection): Promise<void> {
        const login = packet.getPacketData();
        if (login === null) throw new Error('Cannot handle LoginPacket without packet data');

        // A failed status is followed by a disconnect, as the docs have it: the status picks
        // the client's "Outdated client" or "Outdated server" screen, and the disconnect
        // carries the matching reason and hangs up. Without it the connection stayed open.
        //
        // Not a second negotiation: the registry was consulted once, at
        // `RequestNetworkSettings`, and this only refuses a login that contradicts the codec
        // that negotiation assigned. A client that skips the negotiation never gets here:
        // its login does not decode under the handshake codec, and the login phase it would
        // be gated on is only entered by negotiating.
        if (login.protocolVersion !== connection.codec.protocolVersion) {
            const outdatedClient = login.protocolVersion < connection.codec.protocolVersion;
            const status = outdatedClient ? PlayStatus.LoginFailed_ClientOld : PlayStatus.LoginFailed_ServerOld;
            await connection.sendDataPacket(new PlayStatusPacket({ status }), true);
            await connection.disconnect(
                outdatedClient
                    ? `Outdated client! Please use ${connection.codec.minecraftVersions.at(-1)}`
                    : 'Outdated server!',
                false,
                outdatedClient ? DisconnectReason.OUTDATED_CLIENT : DisconnectReason.OUTDATED_SERVER
            );
            return;
        }

        let identity = parseLoginIdentity(login);

        // The client renders this status as "server full", so the player learns why without
        // the server building a player it would only tear down again. The disconnect that
        // follows carries `ServerFull` and hangs up.
        if (server.getSessionManager().getSessions().length >= server.getConfig().getMaxPlayers()) {
            await connection.sendDataPacket(
                new PlayStatusPacket({ status: PlayStatus.LoginFailed_ServerFullSubClient }),
                true
            );
            await connection.disconnect('Server is full!', false, DisconnectReason.SERVER_FULL);
            return;
        }

        // With online mode on, the account comes from the signed token and nowhere else. The claims
        // parsed above are whatever the client wrote; they are replaced, not trusted, and a login
        // that cannot be verified is refused before anything about it is acted on.
        if (server.getConfig().getOnlineMode()) {
            try {
                const verified = await verifyLogin(login);
                // A verified login only says the chain is real. Without Minecraft's encryption
                // handshake, nothing else shows this client holds the chain's key and is not
                // sending a login it recorded from somebody else. Bedrock Dedicated Server
                // 1.26.60 refuses such a login the same way (NotAuthenticated), so this is not
                // an extra check a retail client could fail.
                if (!(await connection.provesIdentityKey(verified.identityPublicKey))) {
                    throw new LoginRefused(
                        'You must be logged in with Xbox Live to join.',
                        "the connection's identity does not prove the login's key"
                    );
                }
                identity = {
                    ...identity,
                    xuid: verified.xuid,
                    displayName: verified.displayName,
                    identity: verified.identity ?? identityFromXUID(verified.xuid),
                    identityPublicKey: verified.identityPublicKey
                };
            } catch (error: unknown) {
                if (!(error instanceof LoginRefused)) throw error;
                LoginHandler.reportRefusal(login.protocolVersion, identity, server, error.detail);
                await connection.disconnect(error.message, false, DisconnectReason.NOT_AUTHENTICATED);
                return;
            }
        }

        // Kick the player if their username is invalid
        if (!identity.displayName) {
            LoginHandler.reportRefusal(login.protocolVersion, identity, server, 'no username');
            await connection.disconnect('Invalid username!', false, DisconnectReason.INVALID_PLAYER);
            return;
        }

        // Rejected rather than replaced. A login carrying no identity used to be handed a
        // freshly generated uuid, which the client had never heard of - so the player went
        // into the player list under an id nothing on the other side could match.
        if (!identity.identity) {
            LoginHandler.reportRefusal(login.protocolVersion, identity, server, 'no identity');
            await connection.disconnect('Invalid identity!', false, DisconnectReason.INVALID_PLAYER);
            return;
        }

        // Before the handshake, so a later login of the same account finds this one while it
        // waits for the client's answer. A reservation replaces nobody; `admit` does that.
        server.getSessionManager().reserveIdentity(connection, accountOf(identity));

        // A login that names an identity key is answered with the encryption handshake, and the rest
        // of it waits for the client's reply. One that names none stays in plaintext.
        if (identity.identityPublicKey && (await LoginHandler.beginEncryption(identity, login, server, connection))) {
            return;
        }

        await LoginHandler.admit(identity, server, connection);
    }

    /**
     * Sends `ServerToClientHandshake` and turns encryption on, leaving the login to finish when
     * the client answers.
     *
     * On a transport that encrypts the wire itself the handshake still goes out but encryption
     * stays off. That is what Bedrock Dedicated Server 1.26.51 does over NetherNet, where DTLS
     * covers the data channel: it sends the handshake and the client answers in the clear.
     *
     * The key comes from the identity key the login chain names. That key is only as trustworthy
     * as the chain, which this server does not verify yet, so the session is protected from
     * somebody watching the wire and not from somebody rewriting the login.
     * @returns Whether the handshake is under way; false means the login was refused.
     */
    private static async beginEncryption(
        identity: LoginIdentity,
        login: NonNullable<ReturnType<LoginPacket['getPacketData']>>,
        server: Server,
        connection: ClientConnection
    ): Promise<boolean> {
        let handshake: Awaited<ReturnType<ReturnType<typeof sessionEncryption>['begin']>>;
        try {
            handshake = await sessionEncryption().begin(identity.identityPublicKey!);
        } catch (error: unknown) {
            LoginHandler.reportRefusal(login.protocolVersion, identity, server, 'unusable identity key');
            server.getLogger().debug(String(error), 'LoginHandler/beginEncryption');
            await connection.disconnect('Invalid identity!', false, DisconnectReason.INVALID_PLAYER);
            return true;
        }

        connection.resumeLogin = () => LoginHandler.admit(identity, server, connection);
        connection.phase = 'encryption';
        // The last frame in the clear: the client turns encryption on when it reads this.
        await connection.sendDataPacket(new ServerToClientHandshakePacket({ jwt: handshake.jwt }), true);
        if (!connection.transportCapabilities.encrypted) connection.startEncryption(handshake.codec);
        return true;
    }

    /**
     * The part of a login after the client is known and, when it can be, the session encrypted.
     *
     * One live player per account: a login that is let in replaces every other connection
     * holding the same account, whatever phase that one is in (#2951). It used to look only at
     * players who had finished joining, so a second login during the first one's join let both
     * in under one UUID. A connection still joining is replaced once its join settles, through
     * the same kick a joined player gets, so its record is saved before this login reads it.
     */
    private static async admit(identity: LoginIdentity, server: Server, connection: ClientConnection): Promise<void> {
        const sessions = server.getSessionManager();
        // A later login of the same account replaced this one while it waited for the handshake.
        if (!sessions.holdsIdentity(connection)) return;

        // Refused before the account is claimed: a login turned away here never touches the
        // session it named, which is the whole of the impersonation this used to allow.
        if (!identity.xuid && server.getConfig().getOnlineMode()) {
            await connection.disconnect('Server is in online-mode!', false, DisconnectReason.NOT_AUTHENTICATED);
            return;
        }

        const reason = server.getBanManager().isBanned({ name: identity.displayName });
        if (reason !== false) {
            await connection.disconnect(
                `You have been banned${reason ? ` for reason: ${reason}` : ''}!`,
                false,
                DisconnectReason.NOT_ALLOWED
            );
            return;
        }

        let settle!: () => void;
        const joined = new Promise<void>((resolve) => {
            settle = resolve;
        });
        try {
            for (const replaced of sessions.claimIdentity(connection, accountOf(identity), joined)) {
                await replaced.joined;
                const replacedSession = replaced.connection.getPlayerSession();
                if (replacedSession) await replacedSession.kick(REPLACED, DisconnectReason.LOGGED_IN_OTHER_LOCATION);
                else await replaced.connection.disconnect(REPLACED, false, DisconnectReason.LOGGED_IN_OTHER_LOCATION);
            }

            await LoginHandler.join(identity, server, connection);
        } finally {
            settle();
        }
    }

    /** Builds the player for a login that holds its account and lets it into the resource pack exchange. */
    private static async join(identity: LoginIdentity, server: Server, connection: ClientConnection): Promise<void> {
        // Resolved here because this is where a world is first available and awaiting is
        // allowed. An entity has to be given somewhere to be, so there is no longer a moment
        // where one exists at the origin waiting to be told where it really is.
        const world = server.getWorldManager().getDefaultWorld();
        const spawn = await world.getSpawnPosition();
        // The entity id is drawn here, and the store player enters a store only at
        // `SetLocalPlayerAsInitialized`. Built inert: nothing server-wide hears of it until it is
        // filed below, so a login rejected before then leaves nothing behind.
        const uuid = UUID.fromString(identity.identity);
        const player = new StorePlayer(entityIds.next(), { uuid, name: identity.displayName, xuid: identity.xuid });
        player.skin = identity.skin;
        player.device = identity.device;
        // The spawn is where the eyes go, as a client reports its position.
        player.standAt({ x: spawn.getX(), y: spawn.getY() - EYE_HEIGHT, z: spawn.getZ() });

        // A login of the same account after this one took it while the spawn was read. That one
        // waits for this join to settle and then disconnects this connection, which has no
        // player to save yet.
        if (!server.getSessionManager().holdsIdentity(connection)) return;

        // Joined to its connection only once it is going to be let in, and torn down as a
        // pair if the join itself fails - otherwise the session would keep its place in the
        // chunk rotation with nothing on the other end of it.
        //
        // `join` sends nothing. Until the client has `PlayStatus(LoginSuccess)` below it is
        // still logging in, and a retail client handed a game packet in that state drops the
        // connection with `InitialConnection-90`. Nothing but PlayStatus and ResourcePacksInfo
        // leaves here; the rest waits for `ResourcePackClientResponseHandler`.
        const session = createConnectedPlayer({
            server,
            connection,
            player,
            identity: accountOf(identity),
            world
        });
        try {
            await session.join();
        } catch (error: unknown) {
            await connection.closePlayerSession();
            throw error;
        }

        // The login became a player session, so the resource pack exchange owns the
        // connection from here.
        connection.phase = 'resourcePacks';

        await session.sendPlayStatus(PlayStatus.LoginSuccess);

        // Finalize connection handshake
        await connection.sendDataPacket(
            new ResourcePacksInfoPacket({
                resourcePackRequired: false,
                hasAddonPacks: false,
                hasScripts: false,
                forceDisableVibrantVisuals: false,
                worldTemplate: { uuidMostSignificant: 0n, uuidLeastSignificant: 0n, version: '' },
                packs: []
            }),
            true
        );
    }
}
