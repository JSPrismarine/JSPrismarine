import { RakNetListener } from '@jsprismarine/raknet';
import Chat, { ChatType } from './chat/Chat';
import BanManager from './ban/BanManager';
import BatchPacket from './network/packet/BatchPacket';
import BlockManager from './block/BlockManager';
import { BlockMappings } from './block/BlockMappings';
import ChatEvent from './events/chat/ChatEvent';
import ChatManager from './chat/ChatManager';
import ClientConnection from './network/ClientConnection';
import CommandManager from './command/CommandManager';
import Console from './Console';
import type { DataPacket } from './network/Packets';
import { EventManager } from './events/EventManager';
import Identifiers from './network/Identifiers';
import ItemManager from './item/ItemManager';
import PacketRegistry from './network/PacketRegistry';
import { PermissionManager } from './permission/PermissionManager';
import { QueryManager } from './query/QueryManager';
import RaknetConnectEvent from './events/raknet/RaknetConnectEvent';
import RaknetDisconnectEvent from './events/raknet/RaknetDisconnectEvent';
import RaknetEncapsulatedPacketEvent from './events/raknet/RaknetEncapsulatedPacketEvent';
import SessionManager from './SessionManager';
import { TickEvent } from './events/Events';
import Timer from './utils/Timer';
import WorldManager from './world/WorldManager';

import type Config from './config/Config';
import type LoggerBuilder from './utils/Logger';
import type { RakNetSession, InetAddress } from '@jsprismarine/raknet';
import { buildRakNetServerName } from './utils/ServerName';

import { version } from '../package.json' assert { type: 'json' };

export default class Server {
    private raknet!: RakNetListener;
    private readonly logger: LoggerBuilder;
    private readonly config: Config;
    private readonly console: Console;
    private readonly eventManager = new EventManager();
    private readonly packetRegistry: PacketRegistry;
    private readonly sessionManager = new SessionManager();
    private readonly commandManager: CommandManager;
    private readonly worldManager: WorldManager;
    private readonly itemManager: ItemManager;
    private readonly blockManager: BlockManager;
    private readonly queryManager: QueryManager;
    private readonly chatManager: ChatManager;
    private readonly permissionManager: PermissionManager;
    private readonly banManager: BanManager;

    private stopping = false;
    private tickerTimer: NodeJS.Timeout | undefined;
    private tps = 0;
    private tick = 0;

    // TODO: Move this somewhere else.
    private static readonly MINECRAFT_TICK_TIME_MS = 1000 / 20;

    /**
     * Creates a new server instance.
     * @constructor
     * @param {LoggerBuilder} logger - The logger.
     * @param {Config} config - The config.
     * @param {string} version - The server version.
     */
    public constructor({ logger, config }: { logger: LoggerBuilder; config: Config }) {
        logger.info(
            `Starting JSPrismarine server version §ev${version}§r for Minecraft: Bedrock Edition ${Identifiers.MinecraftVersions.at(-1)} (protocol version §e${Identifiers.Protocol}§r)`,
            'Server'
        );

        this.logger = logger;
        this.config = config;
        this.console = new Console(this);
        this.packetRegistry = new PacketRegistry(this);
        this.itemManager = new ItemManager(this);
        this.blockManager = new BlockManager(this);
        this.worldManager = new WorldManager(this);
        this.commandManager = new CommandManager(this);
        this.queryManager = new QueryManager(this);
        this.chatManager = new ChatManager(this);
        this.permissionManager = new PermissionManager(this);
        this.banManager = new BanManager(this);
    }

    /**
     * Enables the server.
     * @returns {Promise<void>} A promise that resolves when the server is enabled.
     */
    private async onEnable(): Promise<void> {
        this.config.onEnable();
        await this.logger.onEnable();
        await this.permissionManager.onEnable();
        await this.banManager.onEnable();
        await this.itemManager.onEnable();
        await this.blockManager.onEnable();
        await this.commandManager.onEnable();
    }

    /**
     * Disables the server.
     * @returns {Promise<void>} A promise that resolves when the server is disabled.
     */
    private async onDisable(): Promise<void> {
        await this.commandManager.onDisable();
        await this.blockManager.onDisable();
        await this.itemManager.onDisable();
        await this.banManager.onDisable();
        await this.permissionManager.onDisable();
        await this.packetRegistry.onDisable();
        this.config.onDisable();
        await this.logger.onDisable();
    }

    /**
     * Reloads the server.
     * @returns {Promise<void>} A promise that resolves when the server is reloaded.
     */
    public async reload(): Promise<void> {
        await this.onDisable();
        await this.onEnable();
    }

    /**
     * Starts the server.
     * @param {string} [serverIp='0.0.0.0'] - The server IP.
     * @param {number} [port=19132] - The server port.
     * @returns {Promise<void>} A promise that resolves when the server is started.
     */
    public async bootstrap(serverIp = '0.0.0.0', port = 19132): Promise<void> {
        await this.onEnable();
        await BlockMappings.initMappings(this);
        await this.worldManager.onEnable();
        await this.packetRegistry.onEnable();

        this.raknet = new RakNetListener(
            this.getConfig().getMaxPlayers(),
            this.getConfig().getOnlineMode(),
            this.getLogger()
        );
        this.raknet.setServerName(buildRakNetServerName(this));
        this.raknet.start(serverIp, port);

        this.raknet.on('openConnection', async (session: RakNetSession) => {
            const event = new RaknetConnectEvent(session);
            await this.eventManager.emit('raknetConnect', event);

            if (event.isCancelled()) {
                session.disconnect();
                return;
            }

            const token = session.getAddress().toToken();
            if (this.sessionManager.has(token)) {
                this.logger.error(`Another client with token (${token}) is already connected!`);
                session.disconnect('Already connected from another location');
                return;
            }

            const timer = new Timer();
            this.logger.debug(`${token} is attempting to connect`);
            this.sessionManager.add(token, new ClientConnection(session, this.logger));
            this.logger.verbose(`New connection handling took §e${timer.stop()} ms§r`);
        });

        this.raknet.on('closeConnection', async (inetAddr: InetAddress, reason: string) => {
            const event = new RaknetDisconnectEvent(inetAddr, reason);
            await this.eventManager.emit('raknetDisconnect', event);

            const time = Date.now();
            const token = inetAddr.toToken();
            try {
                const player = this.sessionManager.getPlayer(token);

                // De-spawn the player to all online players
                await player.getNetworkSession().removeFromPlayerList();
                for (const onlinePlayer of this.sessionManager.getAllPlayers()) {
                    await player.getNetworkSession().sendDespawn(onlinePlayer);
                }

                // Sometimes we fail at decoding the username for whatever reason
                if (player.getName()) {
                    // Announce disconnection
                    const event = new ChatEvent(
                        new Chat(
                            this.console,
                            `§e%multiplayer.player.left`, // TODO: handle translations.
                            [player.getName()],
                            true,
                            '*.everyone',
                            ChatType.TRANSLATION
                        )
                    );
                    await this.eventManager.emit('chat', event);
                }

                await player.onDisable();
                await player.getWorld().removeEntity(player);
                this.sessionManager.remove(token);
            } catch (error: unknown) {
                this.logger.debug(`Cannot remove connection from non-existing player (${token})`);
                this.logger.error(error);
            }

            this.logger.debug(`${token} disconnected due to ${reason}`);
            this.logger.debug(`Player destruction took about ${Date.now() - time} ms`);
        });

        this.raknet.on('encapsulated', async (packet: any, inetAddr: InetAddress) => {
            const event = new RaknetEncapsulatedPacketEvent(inetAddr, packet);
            await this.eventManager.emit('raknetEncapsulatedPacket', event);

            let connection: ClientConnection | null;
            if ((connection = this.sessionManager.get(inetAddr.toToken()) ?? null) === null) {
                this.logger.error(`Got a packet from a closed connection (${inetAddr.toToken()})`);
                return;
            }

            try {
                // Read batch content and handle them
                const batched = new BatchPacket(packet.content);
                batched.compressed = connection.hasCompression;

                // Read all packets inside batch and handle them
                for (const buf of await batched.asyncDecode()) {
                    const pid = buf[0]!;

                    if (!this.packetRegistry.getPackets().has(pid)) {
                        this.logger.warn(`Packet 0x${pid.toString(16)} isn't implemented`);
                        continue;
                    }

                    // Get packet from registry
                    const packet = new (this.packetRegistry.getPackets().get(pid)!)(buf);

                    try {
                        packet.decode();
                    } catch (error: unknown) {
                        this.logger.error(error);
                        this.logger.error(`Error while decoding packet: ${packet.constructor.name}: ${error}`);
                        continue;
                    }

                    try {
                        const handler = this.packetRegistry.getHandler(pid);
                        this.logger.silly(`Received §b${packet.constructor.name}§r packet`);
                        await (handler as any).handle(packet, this, connection.getPlayerSession() ?? connection);
                    } catch (error: unknown) {
                        this.logger.error(`Handler error ${packet.constructor.name}-handler: (${error})`);
                        this.logger.error(error);
                    }
                }
            } catch (error: unknown) {
                this.logger.error(error);
            }
        });

        this.raknet.on('raw', async (buffer: Buffer, inetAddr: InetAddress) => {
            try {
                await this.queryManager.onRaw(buffer, inetAddr);
            } catch (error: unknown) {
                this.logger.error(error);
                this.logger.verbose(`QueryManager failed with error: ${error}`);
            }
        });

        let startTime = Date.now();
        let tpsStartTime = Date.now();
        let lastTickTime = Date.now();
        let tpsStartTick = this.tick;
        const tick = () => {
            if (this.stopping) return;

            const event = new TickEvent(this.tick);
            void this.eventManager.emit('tick', event);

            const ticksPerSecond = 1000 / Server.MINECRAFT_TICK_TIME_MS;

            // Update all worlds
            for (const world of this.worldManager.getWorlds()) {
                void world.update(event.getTick());
            }

            // Update RakNet server name
            if (this.tick % ticksPerSecond === 0) {
                this.raknet.setServerName(buildRakNetServerName(this));
            }

            this.tick++;
            const endTime = Date.now();
            const elapsedTime = endTime - startTime;
            const expectedElapsedTime = this.tick * Server.MINECRAFT_TICK_TIME_MS;
            const executionTime = endTime - lastTickTime;

            // Adjust sleepTime based on execution speed
            let sleepTime = Server.MINECRAFT_TICK_TIME_MS - executionTime;
            if (elapsedTime < expectedElapsedTime) {
                // If we're running faster than expected, increase sleepTime
                sleepTime += expectedElapsedTime - elapsedTime;
            } else if (elapsedTime > expectedElapsedTime) {
                // If we're running slower than expected, decrease sleepTime but don't let it go below 0
                sleepTime = Math.max(0, sleepTime - (elapsedTime - expectedElapsedTime));
            }

            // Calculate tps based on the actual elapsed time since the start of the tick
            if (tpsStartTime !== endTime) {
                this.tps = ((this.tick - tpsStartTick) * 1000) / (endTime - tpsStartTime);
            }

            if (endTime - tpsStartTime >= 1000) {
                tpsStartTick = this.tick;
                tpsStartTime = endTime;
            }

            this.tps = Math.min(this.tps, 20); // Ensure tps does not exceed 20

            lastTickTime = endTime;
            this.tickerTimer = setTimeout(tick, sleepTime);
            this.tickerTimer.unref();
        };

        // Start ticking
        tick();

        this.logger.info(`JSPrismarine is now listening on port §b${port}`);
    }

    /**
     * Kills the server asynchronously.
     * @param {object} [options] - The options.
     * @param {boolean} [options.withoutSaving] - If the server should save the worlds before shutting down.
     * @param {boolean} [options.crash] - If the server should crash.
     * @returns {Promise<void>} A promise that resolves when the server is killed.
     */
    public async shutdown(options?: { withoutSaving?: boolean; crash?: boolean }): Promise<void> {
        if (this.stopping) return;
        this.stopping = true;

        this.logger.info('Stopping server', 'Server/kill');
        await this.console.onDisable();

        clearInterval(this.tickerTimer);

        try {
            // Kick all online players
            for (const player of this.sessionManager.getAllPlayers()) {
                await player.kick('Server closed.');
            }

            // Save all worlds
            if (!options?.withoutSaving) await this.worldManager.save();

            await this.worldManager.onDisable();
            await this.onDisable();

            // FIXME: this.raknet might be undefined if we kill the server really early.
            try {
                this.raknet.kill();
            } catch {}

            this.getLogger().info('Server stopped!');

            process.exit(options?.crash ? 1 : 0);
        } catch (error: unknown) {
            this.logger.error(error);
            process.exit(1);
        }
    }

    public async broadcastPacket<T extends DataPacket>(dataPacket: T): Promise<void> {
        // Maybe i can improve this by using the UDP broadcast, all unconnected clients
        // will ignore the connected packet probably, but may cause issues.
        for (const onlinePlayer of this.sessionManager.getAllPlayers()) {
            await onlinePlayer.getNetworkSession().getConnection().sendDataPacket(dataPacket);
        }
    }

    /**
     * Returns the server version.
     * @returns {string} The server version.
     * @example
     * ```typescript
     * console.log(server.getVersion());
     * ```
     */
    public getVersion(): string {
        return version;
    }

    /**
     * Returns the identifiers.
     * @returns {Identifiers} The identifiers.
     */
    public getIdentifiers(): typeof Identifiers {
        return Identifiers;
    }

    /**
     * Returns the query manager.
     * @returns {QueryManager} The query manager.
     */
    public getQueryManager(): QueryManager {
        return this.queryManager;
    }

    /**
     * Returns the command manager.
     * @returns {CommandManager} The command manager.
     */
    public getCommandManager(): CommandManager {
        return this.commandManager;
    }

    /**
     * Returns the player manager.
     * @returns {SessionManager} The player manager.
     */
    public getSessionManager(): SessionManager {
        return this.sessionManager;
    }

    /**
     * Returns the world manager.
     * @returns {WorldManager} The world manager.
     */
    public getWorldManager(): WorldManager {
        return this.worldManager;
    }

    /**
     * Returns the item manager.
     * @returns {ItemManager} The item manager.
     */
    public getItemManager(): ItemManager {
        return this.itemManager;
    }

    /**
     * Returns the block manager.
     * @returns {BlockManager} The block manager.
     */
    public getBlockManager(): BlockManager {
        return this.blockManager;
    }

    /**
     * Returns the logger.
     * @returns {LoggerBuilder} The logger.
     * @example
     * ```typescript
     * // Normal log:
     * server.getLogger().info('Hello, world!');
     * // Debug log:
     * server.getLogger().debug('Hello, world!');
     * // Error log:
     * server.getLogger().error(new Error('Hello World'));
     * ```
     */
    public getLogger(): LoggerBuilder {
        return this.logger;
    }

    /**
     * Returns the packet registry.
     * @returns {PacketRegistry} The packet registry.
     */
    public getPacketRegistry(): PacketRegistry {
        return this.packetRegistry;
    }

    /**
     * Returns the raknet instance.
     * @returns {RakNetListener} The raknet instance.
     */
    public getRaknet() {
        return this.raknet;
    }

    /**
     * Returns the event manager.
     * @returns {EventManager} The event manager.
     */
    public getEventManager(): EventManager {
        return this.eventManager;
    }

    /**
     * Returns the chat manager.
     * @returns {ChatManager} The chat manager.
     */
    public getChatManager(): ChatManager {
        return this.chatManager;
    }

    /**
     * Returns the config.
     * @returns {Config} The config.
     * @example
     * ```typescript
     * console.log(server.getConfig().getMaxPlayers()); // 20
     * ```
     */
    public getConfig(): Config {
        return this.config;
    }

    /**
     * Returns the console instance.
     * @returns {Console} The console instance.
     */
    public getConsole(): Console {
        return this.console;
    }

    /**
     * Returns the permission manager.
     * @returns {PermissionManager} The permission manager.
     */
    public getPermissionManager(): PermissionManager {
        return this.permissionManager;
    }

    /**
     * Returns the ban manager.
     * @returns {BanManager} The ban manager.
     */
    public getBanManager(): BanManager {
        return this.banManager;
    }

    /**
     * Returns this Prismarine instance.
     * @returns {Server} The Prismarine instance.
     */
    public getServer(): Server {
        return this;
    }

    /**
     * Returns the current Tick.
     * @returns {number} The current Tick.
     */
    public getTick(): number {
        return this.tick;
    }

    /**
     * Returns the current TPS.
     * @returns {number} The current TPS.
     */
    public getTPS(): number {
        return this.tps;
    }
}
