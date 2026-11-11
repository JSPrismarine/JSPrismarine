import {
    ClientToServerHandshakePacket,
    DisconnectPacket,
    LoginPacket,
    NetworkSettingsPacket,
    PlayStatus,
    PlayStatusPacket,
    RequestChunkRadiusPacket,
    RequestNetworkSettingsPacket,
    ResourcePackClientResponsePacket,
    ResourcePackStackPacket,
    ResourcePackStatus,
    ResourcePacksInfoPacket,
    ServerToClientHandshakePacket,
    SetLocalPlayerAsInitializedPacket,
    StartGamePacket
} from '@jsprismarine/protocol';
import type { IAuthProvider } from '@jsprismarine/auth';
import type {
    Disconnect,
    NetworkPacket,
    NetworkSettings,
    PlayStatusData,
    ServerToClientHandshake,
    StartGame
} from '@jsprismarine/protocol';
import { deriveEncryptionKey, readHandshake } from './Handshake';
import type { ClientContext } from '../net/ClientHandler';
import type ClientSession from '../net/ClientSession';

/** How far a login has got. Every step is driven by a packet, never by a timer. */
export enum LoginStage {
    REQUESTING_NETWORK_SETTINGS,
    AUTHENTICATING,
    NEGOTIATING_RESOURCE_PACKS,
    AWAITING_SPAWN,
    SPAWNED,
    FAILED
}

export interface LoginResult {
    readonly startGame: StartGame;
}

export interface LoginSequenceOptions {
    readonly protocolVersion: number;
    /** `host:port`, as the client reports having dialled it. */
    readonly serverAddress: string;
    readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * How much world to ask for while joining, in chunks.
 *
 * Small on purpose. View distance is quadratic in what a server has to generate and send, and
 * nothing in a login needs to see far - a caller who wants more can ask for it once it is in.
 */
const DEFAULT_VIEW_DISTANCE = 8;

/**
 * The join, from the first packet to standing in the world.
 *
 * Written as one object with one promise, whose steps are packet handlers it registers on the
 * session for the `login` phase while it runs, because the sequence is genuinely a sequence:
 * each step is only valid after the one before it, and every one of the four ways it can fail -
 * refused, kicked, timed out, wrong version - has to end up at the same place. A caller gets
 * `await login()` and either a spawned player or an error that says why. Once the server has
 * spawned the player, the sequence moves the session to the `play` phase.
 *
 * The steps, and who speaks:
 *
 * ```
 * client  RequestNetworkSettings      uncompressed, and the last one that is
 * server  NetworkSettings             uncompressed; compression is on from here
 * client  Login                       the JWT chain and the client data
 * server  PlayStatus(LoginSuccess)
 * server  ResourcePacksInfo
 * client  ResourcePackResponse(HaveAllPacks)
 * server  ResourcePackStack
 * client  ResourcePackResponse(Completed)
 * server  StartGame, and a great deal else
 * server  PlayStatus(PlayerSpawn)
 * client  SetLocalPlayerAsInitialized
 * ```
 */
export default class LoginSequence {
    private stage = LoginStage.REQUESTING_NETWORK_SETTINGS;
    private startGame: StartGame | null = null;
    private settled = false;

    private resolve!: (result: LoginResult) => void;
    private reject!: (error: Error) => void;
    private timer: NodeJS.Timeout | undefined;

    /** Removes each step's handler from the session, once the login settles. */
    private readonly unregister: (() => void)[] = [];

    /**
     * @param session - The session to log in on. The steps log through its logger.
     * @param auth - Signs the login.
     * @param options - What the login reports to the server.
     */
    public constructor(
        private readonly session: ClientSession,
        private readonly auth: IAuthProvider,
        private readonly options: LoginSequenceOptions
    ) {}

    public getStage(): LoginStage {
        return this.stage;
    }

    /** Runs the sequence, resolving once the server has spawned us. */
    public async run(): Promise<LoginResult> {
        const promise = new Promise<LoginResult>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });

        this.timer = setTimeout(() => {
            this.fail(new Error(`Login timed out at stage ${LoginStage[this.stage]}`));
        }, this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
        this.timer.unref();

        this.unregister.push(
            this.step(NetworkSettingsPacket, (settings, context) => this.onNetworkSettings(settings, context)),
            this.step(ServerToClientHandshakePacket, (handshake, context) =>
                this.onServerToClientHandshake(handshake, context)
            ),
            this.step(PlayStatusPacket, (status, context) => this.onPlayStatus(status, context)),
            this.step(StartGamePacket, (startGame, context) => this.onStartGame(startGame, context)),
            this.step(DisconnectPacket, (disconnect) => this.onDisconnect(disconnect)),
            this.step(ResourcePacksInfoPacket, (_info, context) =>
                this.sendResourcePackResponse(ResourcePackStatus.HaveAllPacks, context)
            ),
            this.step(ResourcePackStackPacket, (_stack, context) =>
                this.sendResourcePackResponse(ResourcePackStatus.Completed, context)
            )
        );

        await this.session.sendImmediate(
            new RequestNetworkSettingsPacket({ protocolVersion: this.options.protocolVersion })
        );

        return promise;
    }

    /** Called when the transport dies under us, so the promise does not hang until timeout. */
    public onTransportClosed(reason: string): void {
        this.fail(new Error(`Disconnected during login: ${reason}`));
    }

    /**
     * Registers one step as the handler of its packet in the `login` phase. A step that throws
     * fails the login, and one whose packet arrives after the login settled does nothing.
     * @returns A function that removes the handler again.
     */
    private step<T>(
        packet: new () => NetworkPacket<T>,
        respond: (data: T, context: ClientContext) => void | Promise<void>
    ): () => void {
        return this.session.registerHandler(packet, {
            phases: ['login'],
            handle: async (data, context) => {
                if (this.settled) return;
                try {
                    await respond(data, context);
                } catch (error: unknown) {
                    this.fail(error instanceof Error ? error : new Error(String(error)));
                }
            }
        });
    }

    /**
     * Compression is enabled *before* the Login goes out, and that ordering is the whole
     * trick: `NetworkSettings` itself arrived uncompressed, and the very next packet in
     * either direction carries an algorithm prefix.
     */
    private async onNetworkSettings(settings: NetworkSettings, { session }: ClientContext): Promise<void> {
        session.enableCompression({
            algorithm: settings.compressionAlgorithm,
            threshold: settings.compressionThreshold
        });

        this.stage = LoginStage.AUTHENTICATING;

        const credentials = await this.auth.createLoginCredentials({
            serverAddress: this.options.serverAddress,
            protocolVersion: this.options.protocolVersion
        });

        await session.sendImmediate(
            new LoginPacket({
                protocolVersion: this.options.protocolVersion,
                chainData: credentials.chainData,
                clientData: credentials.clientData
            })
        );
    }

    /**
     * Encryption is enabled *before* the acknowledgment goes out, mirroring the compression
     * step above and for the same reason: the server turned its own on the instant it sent
     * this, so the `ClientToServerHandshake` that answers it is already an encrypted batch.
     * Sending it in the clear leaves the server decrypting plaintext, which fails as a bad
     * checksum rather than as anything that names the cause.
     *
     * A server may skip the handshake entirely - nothing here requires it - in which case the
     * login carries on unencrypted and this is never called.
     */
    private async onServerToClientHandshake(
        handshake: ServerToClientHandshake,
        { session, log }: ClientContext
    ): Promise<void> {
        const { publicKeyDer, salt } = readHandshake(handshake.jwt);
        const privateKey = await this.auth.getIdentityPrivateKey();

        session.enableEncryption(deriveEncryptionKey(privateKey, publicKeyDer, salt));
        log.debug('Client/LoginSequence: encryption enabled');

        await session.sendImmediate(new ClientToServerHandshakePacket({}));
    }

    /**
     * Asking for a view distance is what finishes the join, not an optimization.
     *
     * A server streams the world regardless, but it will not announce the spawn until the
     * client has said how much of it it wants - so a client that never asks waits at
     * `AWAITING_SPAWN` while chunks pile up around it, which reads as a hung login rather
     * than a missing packet.
     */
    private async onStartGame(startGame: StartGame, { session }: ClientContext): Promise<void> {
        this.startGame = startGame;

        await session.sendImmediate(
            new RequestChunkRadiusPacket({ radius: DEFAULT_VIEW_DISTANCE, maxRadius: DEFAULT_VIEW_DISTANCE })
        );
    }

    private async onPlayStatus(status: PlayStatusData, context: ClientContext): Promise<void> {
        switch (status.status) {
            case PlayStatus.LoginSuccess:
                this.stage = LoginStage.NEGOTIATING_RESOURCE_PACKS;
                break;

            case PlayStatus.PlayerSpawn:
                await this.onPlayerSpawn(context);
                break;

            // The refusals. Each is terminal and each is worth its own words: "login failed"
            // on its own sends people looking in the wrong place.
            case PlayStatus.LoginFailed_ClientOld:
                this.fail(new Error('The server refused the login: this client is out of date'));
                break;
            case PlayStatus.LoginFailed_ServerOld:
                this.fail(new Error('The server refused the login: the server is out of date'));
                break;
            case PlayStatus.LoginFailed_ServerFullSubClient:
                this.fail(new Error('The server refused the login: the server is full'));
                break;
            default:
                this.fail(new Error(`The server refused the login with status ${status.status}`));
                break;
        }
    }

    private async sendResourcePackResponse(status: ResourcePackStatus, { session }: ClientContext): Promise<void> {
        this.stage =
            status === ResourcePackStatus.Completed ? LoginStage.AWAITING_SPAWN : LoginStage.NEGOTIATING_RESOURCE_PACKS;

        // No packs are ever downloaded: this client ships its own and does not accept a
        // server's. Saying "I have them all" is what a client with the packs already
        // cached says, and it is true in the only sense the server checks.
        await session.sendImmediate(new ResourcePackClientResponsePacket({ status, packIds: [] }));
    }

    private async onPlayerSpawn({ session, log }: ClientContext): Promise<void> {
        if (this.settled) return;

        if (this.startGame === null) {
            this.fail(new Error('The server spawned us without ever sending StartGame'));
            return;
        }

        // Answered with the runtime id the server gave us rather than a placeholder.
        // JSPrismarine ignores the field, but a real server does not, and a client that
        // only works against one server is not the point.
        await session.sendImmediate(
            new SetLocalPlayerAsInitializedPacket({ runtimeEntityId: this.startGame.runtimeEntityId })
        );

        this.stage = LoginStage.SPAWNED;
        if (!this.settled) this.session.setPhase('play');
        this.settle(() => this.resolve({ startGame: this.startGame! }));
        log.info(`Joined as runtime entity §b${this.startGame.runtimeEntityId}§r`);
    }

    private onDisconnect(disconnect: Disconnect): void {
        this.fail(new Error(`Disconnected by the server: ${disconnect.message ?? 'no reason given'}`));
    }

    private fail(error: Error): void {
        this.stage = LoginStage.FAILED;
        this.settle(() => this.reject(error));
    }

    private settle(finish: () => void): void {
        if (this.settled) return;

        this.settled = true;
        clearTimeout(this.timer);
        for (const unregister of this.unregister.splice(0)) unregister();
        finish();
    }
}
