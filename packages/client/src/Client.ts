import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import {
    DisconnectPacket,
    ItemRegistryPacket,
    NetworkSettingsPacket,
    PlayStatusPacket,
    ResourcePackStackPacket,
    ResourcePacksInfoPacket,
    ServerToClientHandshakePacket,
    StartGamePacket,
    TextPacket
} from '@jsprismarine/protocol';
import { EventEmitter } from 'node:events';
import LoginSequence from './login/LoginSequence';
import ClientPacketRegistry from './net/ClientPacketRegistry';
import ClientSession from './net/ClientSession';
import RakNetTransport from './net/RakNetTransport';

import type { IAuthProvider } from '@jsprismarine/auth';
import type { StartGame } from '@jsprismarine/protocol';
import type { ITransport, TransportStats } from './net/ITransport';

/**
 * The protocol version this client speaks.
 *
 * One version, hardcoded, exactly as the server does it. A mismatch is refused by both ends
 * with a message that says which side is behind, which is the least a client owes somebody
 * who cannot connect.
 */
export const PROTOCOL_VERSION = 2193;
export const MINECRAFT_VERSION = '1.26.51';

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
    private readonly registry = new ClientPacketRegistry();
    private readonly transport: ITransport;
    private readonly session: ClientSession;

    private login: LoginSequence | null = null;
    private startGame: StartGame | null = null;
    private connected = false;

    public constructor(private readonly options: ClientOptions) {
        super();

        this.logger = options.logger ?? new Logger();
        this.auth = options.auth ?? new OfflineAuthProvider({ displayName: options.displayName ?? 'Player' });

        this.registry.registerAll([
            NetworkSettingsPacket,
            PlayStatusPacket,
            ServerToClientHandshakePacket,
            DisconnectPacket,
            ItemRegistryPacket,
            ResourcePacksInfoPacket,
            ResourcePackStackPacket,
            StartGamePacket,
            TextPacket
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
            protocolVersion: PROTOCOL_VERSION,
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

    public getStats(): TransportStats {
        return this.transport.getStats();
    }

    public async getIdentity() {
        return this.auth.getIdentity();
    }
}
