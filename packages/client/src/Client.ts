import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import {
    ChangeDimensionPacket,
    DisconnectPacket,
    ItemRegistryPacket,
    LevelChunkPacket,
    MovePlayerPacket,
    NetworkChunkPublisherUpdatePacket,
    NetworkSettingsPacket,
    PlayStatusPacket,
    PlayerActionPacket,
    ResourcePackStackPacket,
    ResourcePacksInfoPacket,
    ServerToClientHandshakePacket,
    StartGamePacket,
    StopSoundPacket,
    TextPacket,
    v2193,
    v2225
} from '@jsprismarine/protocol';
import { EventEmitter } from 'node:events';
import DimensionChange from './DimensionChange';
import LoginSequence from './login/LoginSequence';
import ClientPacketRegistry from './net/ClientPacketRegistry';
import ClientSession from './net/ClientSession';
import RakNetTransport from './net/RakNetTransport';

import type { IAuthProvider } from '@jsprismarine/auth';
import type { StartGame } from '@jsprismarine/protocol';
import type { ITransport, TransportStats } from './net/ITransport';
import type { PendingDimensionChange } from './DimensionChange';

/**
 * The protocol version this client speaks unless it is told otherwise.
 *
 * One default, exactly as the server has one. A mismatch is refused by both ends with a
 * message that says which side is behind, which is the least a client owes somebody who
 * cannot connect.
 */
export const PROTOCOL_VERSION = v2193.protocolVersion;
export const MINECRAFT_VERSION = '1.26.51';

/**
 * The Minecraft version string that goes with each protocol this client can speak, and the
 * Minecraft version to report when speaking each protocol.
 *
 * A server refuses a login whose protocol is not its own, so capturing data from a 1.26.60
 * server means speaking 2225 to it. Protocol packet classes use the selected version to read
 * version-gated fields; everything else this client reads and sends is unchanged at 2225.
 */
const PROTOCOLS = new Map([
    [v2193.protocolVersion, { minecraftVersion: MINECRAFT_VERSION }],
    [v2225.protocolVersion, { minecraftVersion: '1.26.60' }]
]);

export interface ClientOptions {
    readonly host: string;
    readonly port?: number;
    /** Defaults to an offline identity under this name. */
    readonly displayName?: string;
    readonly auth?: IAuthProvider;
    readonly logger?: Logger;
    /** Supply one for single player; omit it and the client dials over UDP. */
    readonly transport?: ITransport;
    readonly loginTimeoutMs?: number;
    /**
     * Which protocol to speak. Defaults to {@link PROTOCOL_VERSION}.
     *
     * A server admits one version and refuses every other, so this is only worth setting to
     * reach a server of a version this client does not default to - which is what the
     * Bedrock capture tool does when it records a newer server's data.
     *
     * @throws Error from the constructor when the version has no layout here.
     */
    readonly protocolVersion?: number;
}

/**
 * A Minecraft: Bedrock Edition client, with no interface attached to it.
 *
 * Everything the game needs and nothing it needs a screen for, which is what lets the same
 * object serve the windowed client, the headless one and each of the several hundred
 * connections a load test opens. It owns a transport, a session and a login; what it
 * deliberately does not own is a renderer, an input device or a main loop.
 *
 * @example
 * ```typescript
 * const client = new Client({ host: '127.0.0.1', displayName: 'Steve' });
 * await client.connect();
 * client.on('text', (message) => console.log(message));
 * ```
 */
export default class Client extends EventEmitter {
    private readonly logger: Logger;
    private readonly auth: IAuthProvider;
    private readonly registry: ClientPacketRegistry;
    private readonly transport: ITransport;
    private readonly session: ClientSession;
    private readonly dimensionChange: DimensionChange;

    /** The protocol this client speaks, resolved from the options. */
    private readonly protocolVersion: number;

    private login: LoginSequence | null = null;
    private startGame: StartGame | null = null;
    private connected = false;

    public constructor(private readonly options: ClientOptions) {
        super();

        this.logger = options.logger ?? new Logger();

        this.protocolVersion = options.protocolVersion ?? PROTOCOL_VERSION;
        const protocol = PROTOCOLS.get(this.protocolVersion);
        if (protocol === undefined) {
            throw new Error(
                `This client speaks protocol ${[...PROTOCOLS.keys()].join(' and ')}, not ${this.protocolVersion}`
            );
        }

        this.registry = new ClientPacketRegistry(this.protocolVersion);

        this.auth =
            options.auth ??
            new OfflineAuthProvider({
                displayName: options.displayName ?? 'Player',
                // A server checks the version a client reports against the protocol it
                // announced, so the two have to be set together.
                clientData: { gameVersion: protocol.minecraftVersion }
            });

        this.registry.registerAll([
            NetworkSettingsPacket,
            PlayStatusPacket,
            ServerToClientHandshakePacket,
            DisconnectPacket,
            ItemRegistryPacket,
            ResourcePacksInfoPacket,
            ResourcePackStackPacket,
            StartGamePacket,
            TextPacket,
            // The dimension change sequence, in the order the server sends it, and the
            // teleport that ends it.
            ChangeDimensionPacket,
            StopSoundPacket,
            NetworkChunkPublisherUpdatePacket,
            PlayerActionPacket,
            LevelChunkPacket,
            MovePlayerPacket
        ]);

        this.transport =
            options.transport ??
            new RakNetTransport(this.logger, {
                host: options.host,
                port: options.port ?? 19132,
                timeoutMs: options.loginTimeoutMs
            });

        this.session = new ClientSession(this.transport, this.registry, this.logger);

        this.transport.on('close', (reason) => {
            this.connected = false;
            this.login?.onTransportClosed(reason);
            this.emit('disconnect', reason);
        });

        this.session.on('packet', (packet) => this.emit('packet', packet));

        // Answers the server's `ChangeDimension` for the life of the connection; the login
        // never sees one, so this is not part of `LoginSequence`.
        this.dimensionChange = new DimensionChange(
            this.session,
            this.logger,
            () => this.startGame?.runtimeEntityId ?? 0n
        );
        this.dimensionChange.on('end', (change: PendingDimensionChange) => this.emit('dimensionChange', change));
    }

    /**
     * Connects, logs in, and resolves once the server has spawned us.
     *
     * One call rather than `connect` then `login`, because there is nothing useful a caller
     * can do between the two: every packet before the spawn belongs to the handshake.
     */
    public async connect(): Promise<StartGame> {
        if (this.connected) throw new Error('Already connected');

        await this.transport.connect();
        this.connected = true;

        this.login = new LoginSequence(this.session, this.auth, this.logger, {
            protocolVersion: this.protocolVersion,
            serverAddress: `${this.options.host}:${this.options.port ?? 19132}`,
            timeoutMs: this.options.loginTimeoutMs
        });

        try {
            const { startGame } = await this.login.run();
            this.startGame = startGame;
            this.emit('spawn', startGame);
            return startGame;
        } catch (error: unknown) {
            // The transport is torn down on a failed login rather than left open: a socket
            // that got as far as RakNet but no further is not something a caller can retry
            // on, and leaving it would keep the process alive.
            this.transport.close('login failed');
            throw error;
        }
    }

    public disconnect(reason = 'client disconnect'): void {
        if (!this.connected) return;

        this.connected = false;
        this.transport.close(reason);
    }

    public isConnected(): boolean {
        return this.connected;
    }

    /** Null until the login completes. */
    public getStartGame(): StartGame | null {
        return this.startGame;
    }

    public getSession(): ClientSession {
        return this.session;
    }

    public getRegistry(): ClientPacketRegistry {
        return this.registry;
    }

    /** The dimension change responder, which also knows whether one is in progress. */
    public getDimensionChange(): DimensionChange {
        return this.dimensionChange;
    }

    public getStats(): TransportStats {
        return this.transport.getStats();
    }

    public async getIdentity() {
        return this.auth.getIdentity();
    }
}
