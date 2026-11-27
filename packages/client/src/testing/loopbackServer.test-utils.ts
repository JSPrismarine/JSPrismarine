import { OfflineAuthProvider } from '@jsprismarine/auth';
import { Logger } from '@jsprismarine/logger';
import { Server } from '@jsprismarine/prismarine';
import { ConsoleSender } from '@jsprismarine/prismarine/command/ConsoleSender';
import { Config } from '@jsprismarine/prismarine/config/Config';
import { networkToken } from '@jsprismarine/prismarine/modules/tokens';
import type PlayerSession from '@jsprismarine/prismarine/player/PlayerSession';
import { CommandRequestPacket, TextPacket, TextPacketType } from '@jsprismarine/protocol';
import CommandOriginData from '@jsprismarine/protocol/bedrock/wire/structures/CommandOriginData';
import CommandOriginType from '@jsprismarine/protocol/bedrock/wire/structures/CommandOriginType';
import UUID from '@jsprismarine/protocol/bedrock/wire/structures/UUID';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';

import Client from '../Client';
import ClientWorld from '../ClientWorld';
import type { JavaClientOptions } from '../java/JavaClient';
import { JavaClient } from '../java/JavaClient';
import { playerAuthInput } from '../playerAuthInput';
import { LoopbackNetwork } from './loopback.test.helper';

import type { WorldPosition } from '../ClientWorld';

/** More ticks than a join on a stepped flat-world server needs. */
const MAX_JOIN_TICKS = 120;

/**
 * More ticks than a Java join needs. Its packets cross a real TCP socket, which nothing here
 * waits on, so the server ticks while each answer is on its way.
 */
const MAX_JAVA_JOIN_TICKS = 2_000;

const nextTurn = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** The config every loopback server starts from: a stepped, offline, flat world with no workers. */
const BASE_CONFIG = {
    'online-mode': false,
    'java-enabled': false,
    'preload-radius': 0,
    'view-distance': 2,
    'enable-ticking': false,
    'chunk-workers': 0,
    'enable-query': false,
    // Off unless a test checks the keep-alive: a ping is timed by the clock, and a loaded host
    // that answers late would be kicked partway through a test that has nothing to do with it.
    'keep-alive-interval': 0,
    worlds: { world: { preset: 'minecraft:flat', provider: 'LevelDB', seed: '1' } }
};

/** How a {@link startLoopbackServer} server starts. */
export interface LoopbackServerOptions {
    /** Names the state directory. */
    readonly name: string;
    /** Config entries written over {@link BASE_CONFIG}, a key at a time, or a function of the state directory that returns them. */
    readonly config?: Readonly<Record<string, unknown>> | ((stateRoot: string) => Readonly<Record<string, unknown>>);
    /** Files written into the state directory before the server boots, by path relative to it. */
    readonly files?: Readonly<Record<string, string | Uint8Array>>;
}

/** What one console command did. */
export interface CommandResult {
    /** Whether the command ran, as `dispatchCommand` answers it. */
    readonly ran: boolean;
    /** The lines the command sent the console while it ran. */
    readonly messages: readonly string[];
}

/** One input a {@link LoopbackPlayer} reports: where the player is and where it looks. */
export interface PlayerInput {
    readonly position?: WorldPosition;
    readonly yaw?: number;
    readonly pitch?: number;
}

/** One client joined to a {@link LoopbackServer}, and the server's session for it. */
export interface LoopbackPlayer {
    readonly client: Client;
    /** What the client knows from the packets it was sent. */
    readonly world: ClientWorld;
    /** The name the player joined with. */
    readonly name: string;
    /** The server's session for the player, or `undefined` once it is gone. */
    session(): PlayerSession | undefined;
    /**
     * Sends one `PlayerAuthInput`, from the client's position or `position`, and records the
     * position in the world. The first input after a server teleport says it handled it.
     */
    input(options?: PlayerInput): Promise<void>;
    /** Sends a line of chat, as the player typing it without a slash. */
    chat(message: string): Promise<void>;
    /** Sends a command the player typed, with or without its leading slash, and settles. */
    runCommand(line: string): Promise<void>;
    /** Disconnects the client. */
    leave(): void;
}

/** A headless server stepped by hand, with clients joined to it over loopback pipes. */
export interface LoopbackServer {
    readonly server: Server;
    readonly stateRoot: string;
    /** Resolves once the server, every client and every pipe between them have nothing left to do. */
    settle(): Promise<void>;
    /** Settles, advances the server one tick, and settles again, `count` times. */
    tick(count?: number): Promise<void>;
    /**
     * Ticks until `condition` holds, checking before each tick.
     * @param condition - What to wait for.
     * @param what - What the wait is for, named in the error when it never holds.
     * @param maxTicks - How many ticks it may take.
     * @returns How many ticks it took.
     * @throws Error when `condition` still fails after `maxTicks` ticks.
     */
    until(condition: () => boolean, what: string, maxTicks?: number): Promise<number>;
    /** Runs a console command between ticks, as a console line lands, and settles. */
    command(line: string): Promise<CommandResult>;
    /** Joins a client under `displayName`, ticking until the server has spawned it. */
    join(displayName: string): Promise<LoopbackPlayer>;
    /**
     * Joins a Java Edition client over TCP under `username`, ticking until it loaded the world and
     * the server put its player in it. The server needs `java-enabled`, and `java-port` 0 lets the
     * system pick a free port.
     */
    joinJava(username: string, options?: Pick<JavaClientOptions, 'language' | 'viewDistance'>): Promise<JavaClient>;
    /**
     * Ticks until `condition` holds, giving the Java clients' sockets a turn before each check.
     * @param condition - What to wait for.
     * @param what - What the wait is for, named in the error when it never holds.
     * @param maxTicks - How many ticks it may take.
     */
    untilJava(condition: () => boolean, what: string, maxTicks?: number): Promise<void>;
    /**
     * Starts a client's join without waiting for it, for a join that may be refused or
     * replaced. The caller ticks the server until `joined` settles.
     */
    connect(displayName: string): { player: LoopbackPlayer; joined: Promise<unknown> };
    /** Disconnects every client, shuts the server down and removes its state directory. */
    close(): Promise<void>;
}

/** A console sender that keeps the replies a command sends it. */
class RecordingConsole extends ConsoleSender {
    public readonly messages: string[] = [];

    public override sendMessage(message: string): void {
        this.messages.push(message);
    }
}

/** A stable offline identity for a display name, so a rejoin is the same player. */
const identityOf = (displayName: string): string => {
    const hex = createHash('sha256').update(displayName).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

/**
 * Boots a headless flat-world server on a loopback network, stepped by hand.
 *
 * Nothing here reads a clock: the server advances only when the caller ticks it, and each wait
 * counts ticks. Stubs `JSP_DIR` for the server's state; {@link LoopbackServer.close} restores it.
 * @param options - The server's name, config and files.
 * @returns The running server.
 */
export const startLoopbackServer = async (options: LoopbackServerOptions): Promise<LoopbackServer> => {
    const stateRoot = mkdtempSync(path.join(tmpdir(), `jsprismarine-${options.name}-`));
    for (const [file, content] of Object.entries(options.files ?? {})) {
        mkdirSync(path.dirname(path.join(stateRoot, file)), { recursive: true });
        writeFileSync(path.join(stateRoot, file), content);
    }
    const config = typeof options.config === 'function' ? options.config(stateRoot) : options.config;
    writeFileSync(path.join(stateRoot, 'config.json'), JSON.stringify({ ...BASE_CONFIG, ...config }));
    vi.stubEnv('JSP_DIR', stateRoot);

    const network = new LoopbackNetwork();
    const server = new Server({
        logger: new Logger('error'),
        config: new Config(),
        headless: true,
        transport: network.transport
    });
    const clients: Client[] = [];
    const javaClients: JavaClient[] = [];

    const connections = () => network.connectionIds().flatMap((id) => server.getSessionManager().get(id) ?? []);
    const quiet = (): boolean =>
        server.getKernel().get(networkToken).isInboundSettled() &&
        clients.every((client) => client.getSession().isIdle()) &&
        connections().every((connection) => connection.isOutboundSettled()) &&
        server.getChunkScheduler().isIdle();
    const settle = async (): Promise<void> => {
        for (;;) {
            await Promise.all(clients.map((client) => client.getSession().settled()));
            await server.getChunkScheduler().settled();
            await Promise.all(connections().map((connection) => connection.settleOutbound()));
            await nextTurn();
            if (quiet()) {
                await nextTurn();
                if (quiet()) return;
            }
        }
    };
    const tick = async (count = 1): Promise<void> => {
        for (let index = 0; index < count; index++) {
            await settle();
            server.advanceTick();
            await settle();
        }
    };
    const until = async (condition: () => boolean, what: string, maxTicks = 100): Promise<number> => {
        for (let ticks = 0; ; ticks++) {
            await settle();
            if (condition()) return ticks;
            if (ticks >= maxTicks) throw new Error(`${what}: still false after ${maxTicks} ticks`);
            await tick();
        }
    };

    const command = async (line: string): Promise<CommandResult> => {
        // The console's identity, with the replies kept for the caller instead of logged.
        const console = new RecordingConsole(server);
        const ran = await server.getCommandManager().dispatchCommand(console, console, line);
        await settle();
        return { ran, messages: console.messages };
    };

    const player = (displayName: string): LoopbackPlayer => {
        const client = new Client({
            host: '127.0.0.1',
            transport: network.client(),
            auth: new OfflineAuthProvider({ displayName, identity: identityOf(displayName) }),
            logger: new Logger('error'),
            loginTimeoutMs: 600_000
        });
        clients.push(client);
        const world = new ClientWorld(client);
        let inputTick = 0n;
        let teleportsHandled = 0;
        const session = (): PlayerSession | undefined =>
            server
                .getSessionManager()
                .getSessions()
                .find((entry) => entry.getName() === displayName);
        return {
            client,
            world,
            name: displayName,
            session,
            input: async ({ position, yaw = 0, pitch = 0 }: PlayerInput = {}) => {
                const at = position ?? world.getPosition();
                if (at === undefined) throw new Error(`${displayName} has no position to report`);
                world.setPosition(at);
                const handledTeleport = world.getTeleportCount() > teleportsHandled;
                teleportsHandled = world.getTeleportCount();
                inputTick += 1n;
                await client
                    .getSession()
                    .send(
                        playerAuthInput(
                            { position: at, pitch, yaw, headYaw: yaw },
                            { tick: inputTick, handledTeleport }
                        )
                    );
            },
            chat: async (message) => {
                await client.getSession().send(
                    new TextPacket({
                        type: TextPacketType.Chat,
                        needsTranslation: false,
                        sourceName: displayName,
                        message,
                        xuid: '',
                        platformChatId: '',
                        filtered: ''
                    })
                );
                await settle();
            },
            runCommand: async (line) => {
                const origin = new CommandOriginData(
                    CommandOriginType.Player,
                    UUID.fromString(identityOf(displayName)),
                    '',
                    client.getStartGame()?.entityId ?? 0n
                );
                await client.getSession().send(
                    new CommandRequestPacket({
                        commandName: line.startsWith('/') ? line : `/${line}`,
                        commandOriginData: origin,
                        internal: false,
                        version: 'Latest'
                    })
                );
                await settle();
            },
            leave: () => client.disconnect()
        };
    };

    const connect = (displayName: string) => {
        const joining = player(displayName);
        const joined = joining.client.connect();
        joined.catch(() => {});
        return { player: joining, joined };
    };

    const join = async (displayName: string): Promise<LoopbackPlayer> => {
        const { player: joining, joined } = connect(displayName);
        let done = false;
        void joined
            .finally(() => {
                done = true;
            })
            .catch(() => {});
        for (let ticks = 0; !done; ticks++) {
            if (ticks > MAX_JOIN_TICKS) throw new Error(`${displayName} did not join within ${MAX_JOIN_TICKS} ticks`);
            await tick();
        }
        await joined;
        // The join resolves at the spawn, and the server puts the player in its world in the
        // input step after the client reports itself initialized; commands find it only then.
        await until(
            () =>
                connections().some(
                    (connection) => connection.hasSpawned() && connection.getPlayerSession()?.getName() === displayName
                ),
            `${displayName} never entered the world`
        );
        return joining;
    };

    const untilJava = async (condition: () => boolean, what: string, maxTicks = MAX_JAVA_JOIN_TICKS) => {
        for (let ticks = 0; !condition(); ticks++) {
            if (ticks >= maxTicks) throw new Error(`${what}: still false after ${maxTicks} ticks`);
            // The poll phase, where a socket's bytes arrive, runs before each immediate.
            await nextTurn();
            if (condition()) return;
            await tick();
        }
    };

    const joinJava = async (
        username: string,
        options: Pick<JavaClientOptions, 'language' | 'viewDistance'> = {}
    ): Promise<JavaClient> => {
        const port = server.getKernel().get(networkToken).getJavaPort();
        if (port === undefined) throw new Error('joinJava needs a server started with java-enabled');
        const client = new JavaClient({ host: '127.0.0.1', port, username, ...options });
        javaClients.push(client);
        let done = false;
        const joined = client.connect().finally(() => {
            done = true;
        });
        joined.catch(() => {});
        await untilJava(() => done, `${username} did not join over Java`);
        await joined;
        await untilJava(
            () =>
                server
                    .getSessionManager()
                    .getSessions()
                    .some((session) => session.getName() === username),
            `${username} never entered the world`
        );
        return client;
    };

    const close = async (): Promise<void> => {
        for (const client of javaClients) client.disconnect();
        for (const client of clients) client.disconnect();
        await server.shutdown({ stayAlive: true });
        rmSync(stateRoot, { recursive: true, force: true });
        vi.unstubAllEnvs();
    };

    await server.bootstrap('127.0.0.1', 0);
    server.getChunkCompletionQueue().activate();
    return { server, stateRoot, settle, tick, until, command, join, joinJava, untilJava, connect, close };
};
