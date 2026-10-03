import {
    ClientToServerHandshakePacket,
    LoginPacket,
    PacketIdentifier,
    PlayStatus,
    RequestChunkRadiusPacket,
    RequestNetworkSettingsPacket,
    ResourcePackResponsePacket,
    ResourcePackStatus,
    SetLocalPlayerAsInitializedPacket
} from '@jsprismarine/protocol';
import type { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';

import type { IAuthProvider } from '@jsprismarine/auth';
import type { Logger } from '@jsprismarine/logger';
import type {
    Disconnect,
    NetworkSettings,
    PlayStatusData,
    ServerToClientHandshake,
    StartGame
} from '@jsprismarine/protocol';
import { deriveEncryptionKey, readHandshake } from './Handshake';
import type ClientSession from '../net/ClientSession';
import type { DecodedPacket } from '../net/ClientPacketRegistry';

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
 * Written as one object with one promise rather than as handlers scattered across the
 * client, because the sequence is genuinely a sequence: each step is only valid after the
 * one before it, and every one of the four ways it can fail - refused, kicked, timed out,
 * wrong version - has to end up at the same place. A caller gets `await login()` and either
 * a spawned player or an error that says why.
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

    public constructor(
        private readonly session: ClientSession,
        private readonly auth: IAuthProvider,
        private readonly logger: Logger,
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

        this.session.on('packet', this.onPacket);

        await this.session.sendImmediate(
            new RequestNetworkSettingsPacket({ protocolVersion: this.options.protocolVersion })
        );

        return promise;
    }

    /** Called when the transport dies under us, so the promise does not hang until timeout. */
    public onTransportClosed(reason: string): void {
        this.fail(new Error(`Disconnected during login: ${reason}`));
    }

    private readonly onPacket = (packet: DecodedPacket): void => {
        if (this.settled) return;

        void this.dispatch(packet).catch((error: unknown) => {
            this.fail(error instanceof Error ? error : new Error(String(error)));
        });
    };

    private async dispatch(packet: DecodedPacket): Promise<void> {
        switch (packet.id) {
            case PacketIdentifier.NETWORK_SETTINGS:
                await this.onNetworkSettings(packet.data as NetworkSettings);
                break;
            case PacketIdentifier.SERVER_TO_CLIENT_HANDSHAKE:
                await this.onServerToClientHandshake(packet.data as ServerToClientHandshake);
                break;
            case PacketIdentifier.PLAY_STATUS:
                await this.onPlayStatus(packet.data as PlayStatusData);
                break;
            case PacketIdentifier.RESOURCE_PACKS_INFO:
                await this.sendResourcePackResponse(ResourcePackStatus.HaveAllPacks);
                break;
            case PacketIdentifier.RESOURCE_PACK_STACK:
                await this.sendResourcePackResponse(ResourcePackStatus.Completed);
                break;
            case PacketIdentifier.START_GAME:
                await this.onStartGame(packet.data as StartGame);
                break;
            case PacketIdentifier.DISCONNECT:
                this.onDisconnect(packet.data as Disconnect);
                break;
            default:
                break;
        }
    }

    /**
     * Compression is enabled *before* the Login goes out, and that ordering is the whole
     * trick: `NetworkSettings` itself arrived uncompressed, and the very next packet in
     * either direction carries an algorithm prefix.
     */
    private async onNetworkSettings(settings: NetworkSettings): Promise<void> {
        this.session.enableCompression({
            algorithm: settings.compressionAlgorithm as PacketCompressionAlgorithm,
            threshold: settings.compressionThreshold
        });

        this.stage = LoginStage.AUTHENTICATING;

        const credentials = await this.auth.createLoginCredentials({
            serverAddress: this.options.serverAddress,
            protocolVersion: this.options.protocolVersion
        });

        await this.session.sendImmediate(
            new LoginPacket({
                protocolVersion: this.options.protocolVersion,
                chainData: credentials.chainData,
                clientData: credentials.clientData
            })
        );
    }

    /**
     * Encryption is enabled *before* the acknowledgement goes out, mirroring the compression
     * step above and for the same reason: the server turned its own on the instant it sent
     * this, so the `ClientToServerHandshake` that answers it is already an encrypted batch.
     * Sending it in the clear leaves the server decrypting plaintext, which fails as a bad
     * checksum rather than as anything that names the cause.
     *
     * A server may skip the handshake entirely - nothing here requires it - in which case the
     * login carries on unencrypted and this is never called.
     */
    private async onServerToClientHandshake(handshake: ServerToClientHandshake): Promise<void> {
        const { publicKeyDer, salt } = readHandshake(handshake.jwt);
        const privateKey = await this.auth.getIdentityPrivateKey();

        this.session.enableEncryption(deriveEncryptionKey(privateKey, publicKeyDer, salt));
        this.logger.debug('Client/LoginSequence: encryption enabled');

        await this.session.sendImmediate(new ClientToServerHandshakePacket({}));
    }

    /**
     * Asking for a view distance is what finishes the join, not an optimisation.
     *
     * A server streams the world regardless, but it will not announce the spawn until the
     * client has said how much of it it wants - so a client that never asks waits at
     * `AWAITING_SPAWN` while chunks pile up around it, which reads as a hung login rather
     * than a missing packet.
     */
    private async onStartGame(startGame: StartGame): Promise<void> {
        this.startGame = startGame;

        await this.session.sendImmediate(
            new RequestChunkRadiusPacket({ radius: DEFAULT_VIEW_DISTANCE, maxRadius: DEFAULT_VIEW_DISTANCE })
        );
    }

    private async onPlayStatus(status: PlayStatusData): Promise<void> {
        switch (status.status) {
            case PlayStatus.LoginSuccess:
                this.stage = LoginStage.NEGOTIATING_RESOURCE_PACKS;
                break;

            case PlayStatus.PlayerSpawn:
                await this.onPlayerSpawn();
                break;

            // The refusals. Each is terminal and each is worth its own words: "login failed"
            // on its own sends people looking in the wrong place.
            case PlayStatus.LoginFailedClient:
                this.fail(new Error('The server refused the login: this client is out of date'));
                break;
            case PlayStatus.LoginFailedServer:
                this.fail(new Error('The server refused the login: the server is out of date'));
                break;
            case PlayStatus.LoginFailedServerFull:
                this.fail(new Error('The server refused the login: the server is full'));
                break;
            default:
                this.fail(new Error(`The server refused the login with status ${status.status}`));
                break;
        }
    }

    private async sendResourcePackResponse(status: ResourcePackStatus): Promise<void> {
        this.stage =
            status === ResourcePackStatus.Completed ? LoginStage.AWAITING_SPAWN : LoginStage.NEGOTIATING_RESOURCE_PACKS;

        // No packs are ever downloaded: this client ships its own and does not accept a
        // server's. Saying "I have them all" is what a client with the packs already
        // cached says, and it is true in the only sense the server checks.
        await this.session.sendImmediate(new ResourcePackResponsePacket({ status, packIds: [] }));
    }

    private async onPlayerSpawn(): Promise<void> {
        if (this.settled) return;

        if (this.startGame === null) {
            this.fail(new Error('The server spawned us without ever sending StartGame'));
            return;
        }

        // Answered with the runtime id the server gave us rather than a placeholder.
        // JSPrismarine ignores the field, but a real server does not, and a client that
        // only works against one server is not the point.
        await this.session.sendImmediate(
            new SetLocalPlayerAsInitializedPacket({ runtimeEntityId: this.startGame.runtimeEntityId })
        );

        this.stage = LoginStage.SPAWNED;
        this.settle(() => this.resolve({ startGame: this.startGame! }));
        this.logger.info(`Joined as runtime entity §b${this.startGame.runtimeEntityId}§r`);
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
        this.session.off('packet', this.onPacket);
        finish();
    }
}
