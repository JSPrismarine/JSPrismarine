import { RakNetListener, ServerName } from '@jsprismarine/raknet';
import Console from './Console';
import SessionManager from './SessionManager';
import BanManager from './ban/BanManager';
import BlockManager from './block/BlockManager';
import { BlockMappings } from './block/BlockMappings';
import { ChatManager } from './chat/ChatManager';
import { CommandManager } from './command/CommandManager';
import { EventEmitter } from './events/EventEmitter';
import { TickEvent } from './events/Events';
import RaknetConnectEvent from './events/raknet/RaknetConnectEvent';
import RaknetDisconnectEvent from './events/raknet/RaknetDisconnectEvent';
import RaknetEncapsulatedPacketEvent from './events/raknet/RaknetEncapsulatedPacketEvent';
import ItemManager from './item/ItemManager';
import ClientConnection from './network/ClientConnection';
import Identifiers from './network/Identifiers';
import PacketRegistry from './network/PacketRegistry';
import type { DataPacket } from './network/Packets';
import BatchPacket from './network/packet/BatchPacket';
import { PermissionManager } from './permission/PermissionManager';
import { QueryManager } from './query/QueryManager';
import Timer from './utils/Timer';
import WorldManager from './world/WorldManager';

import type { InetAddress, RakNetSession } from '@jsprismarine/raknet';
import type { Config } from './config/Config';

import type { Logger } from '@jsprismarine/logger';
import { version } from '../package.json' with { type: 'json' };

/**
 * JSPrismarine's main server class.
 * @public
 */
export default class Server extends EventEmitter {
    private raknet!: RakNetListener;
    private readonly logger: Logger;
    private readonly config: Config;
    private readonly console: Console | undefined;
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

    /**
     * If the server is stopping.
     * @internal
     */
    private stopping = false;

    /**
     * The current ticker timer.
     * @internal
     */
    private tickerTimer: NodeJS.Timeout | undefined;

    /**
     * The current TPS.
     * @internal
     */
    private tps = 20;

    /**
     * The current tick.
     * @internal
     */
    private currentTick = 0n;

    /**
     * If the server is headless.
     * @internal
     */
    private readonly headless: boolean;

    // TODO: Move this somewhere else.
    private static readonly MINECRAFT_TICK_TIME_MS = 1000 / 20;

    /**
     * Creates a new server instance.
     * @param {object} options - The options.
     * @param {LoggerBuilder} options.logger - The logger.
     * @param {Config} options.config - The config.
     * @returns {Server} The server instance.
     */
    public constructor({ logger, config, headless = false }: { logger: Logger; config: Config; headless?: boolean }) {
        super();

        this.headless = headless;

        logger.info(
            `Starting JSPrismarine server version §ev${version}§r for Minecraft: Bedrock Edition ${Identifiers.MinecraftVersions.at(-1)} (protocol version §e${Identifiers.Protocol}§r)`
        );

        this.logger = logger;
        this.config = config;
        this.packetRegistry = new PacketRegistry(this);
        this.itemManager = new ItemManager(this);
        this.blockManager = new BlockManager(this);
        this.worldManager = new WorldManager(this);
        if (!this.headless) this.console = new Console(this);
        this.commandManager = new CommandManager(this);
        this.queryManager = new QueryManager(this);
        this.chatManager = new ChatManager(this);
        this.permissionManager = new PermissionManager(this);
        this.banManager = new BanManager(this);
    }

    /**
     * Enables the server.
     * @returns {Promise<void>} A promise that resolves when the server is enabled.
     * @internal
     */
    private async enable(): Promise<void> {
        await this.config.enable();
        await this.console?.enable();
        await this.logger.enable();
        await this.permissionManager.enable();
        await this.banManager.enable();
        await this.itemManager.enable();
        await this.blockManager.enable();
        await this.commandManager.enable();

        this.logger.setConsole(this.console);
    }

    /**
     * Disables the server.
     * @returns {Promise<void>} A promise that resolves when the server is disabled.
     * @internal
     */
    private async disable(): Promise<void> {
        await this.worldManager.disable();
        await this.commandManager.disable();
        await this.blockManager.disable();
        await this.itemManager.disable();
        await this.banManager.disable();
        await this.permissionManager.disable();
        await this.packetRegistry.disable();
        await this.config.disable();
        await this.logger.disable();

        // Finally, remove all listeners.
        this.removeAllListeners();
    }

    public getMetadata() {
        return this.getRaknet().serverName;
    }

    /**
     * Reloads the server.
     * @returns {Promise<void>} A promise that resolves when the server is reloaded.
     * @remarks This method is equivalent to calling {@link Server#disable} and {@link Server#enable}.
     * @remarks This method and functionality is unsupported and should ideally be completely avoided.
     */
    public async reload(): Promise<void> {
        await this.disable();
        await this.enable();
    }

    /**
     * Starts the server.
     * @param {string} [serverIp='0.0.0.0'] - The server IP.
     * @param {number} [port=19132] - The server port.
     * @returns {Promise<void>} A promise that resolves when the server is started.
     */
    public async bootstrap(serverIp = '0.0.0.0', port = 19132): Promise<void> {
        await this.enable();
        await BlockMappings.initMappings(this);
        await this.worldManager.enable();
        await this.packetRegistry.enable();

        this.raknet = new RakNetListener(
            this.getConfig().getMaxPlayers(),
            this.getConfig().getOnlineMode(),
            new ServerName(this),
            this.getLogger()
        );
        this.raknet.start(serverIp, port);

        this.raknet.on('openConnection', async (session: RakNetSession) => {
            const event = new RaknetConnectEvent(session);
            await this.emit('raknetConnect', event);

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
            await this.emit('raknetDisconnect', event);

            const time = Date.now();
            const token = inetAddr.toToken();

            const session = this.sessionManager.get(token);
            if (!session) {
                this.logger.debug(`Cannot remove connection from non-existing player (${token})`);
                return;
            }

            await session.closePlayerSession();

            this.sessionManager.remove(token);
            this.logger.debug(`${token} disconnected due to ${reason}`);
            this.logger.debug(`Player destruction took about ${Date.now() - time} ms`);
        });

        this.raknet.on('encapsulated', async (packet: any, inetAddr: InetAddress) => {
            const event = new RaknetEncapsulatedPacketEvent(inetAddr, packet);
            await this.emit('raknetEncapsulatedPacket', event);

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
            if (!this.config.getEnableQuery()) return;

            try {
                await this.queryManager.onRaw(buffer, inetAddr);
            } catch (error: unknown) {
                this.logger.verbose(`QueryManager encountered an error`);
                this.logger.error(error);
            }
        });

        let startTime = Date.now();
        let tpsStartTime = Date.now();
        let lastTickTime = Date.now();
        let tpsStartTick = this.getTick();
        const tick = () => {
            if (this.stopping) return;

            const event = new TickEvent(this.getTick());
            void this.emit('tick', event);

            const ticksPerSecond = 1000 / Server.MINECRAFT_TICK_TIME_MS;

            // Update all worlds.
            for (const world of this.worldManager.getWorlds()) {
                void world.update(event.getTick());
            }

            // Update RakNet server name.
            if (this.getTick() % ticksPerSecond === 0 && !this.headless) {
                // Update the process title with TPS and tick.
                process.title = `TPS: ${this.getTPS().toFixed(2)} | Tick: ${this.getTick()} | ${process.title.split('| ').at(-1)!}`;
            }

            this.currentTick++;
            const endTime = Date.now();
            const elapsedTime = endTime - startTime;
            const expectedElapsedTime = this.getTick() * Server.MINECRAFT_TICK_TIME_MS;
            const executionTime = endTime - lastTickTime;

            // Adjust sleepTime based on execution speed.
            let sleepTime = Server.MINECRAFT_TICK_TIME_MS - executionTime;
            if (elapsedTime < expectedElapsedTime) {
                // If we're running faster than expected, increase sleepTime.
                sleepTime += expectedElapsedTime - elapsedTime;
            } else if (elapsedTime > expectedElapsedTime) {
                // If we're running slower than expected, decrease sleepTime but don't let it go below 0.
                sleepTime = Math.max(0, sleepTime - (elapsedTime - expectedElapsedTime));
            }

            // Calculate tps based on the actual elapsed time since the start of the tick.
            if (tpsStartTime !== endTime) {
                this.tps = ((this.getTick() - tpsStartTick) * 1000) / (endTime - tpsStartTime);
            }

            if (endTime - tpsStartTime >= 1000) {
                tpsStartTick = this.getTick();
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
     * @param {boolean} [options.crash] - If the server should crash.
     * @returns {Promise<void>} A promise that resolves when the server is killed.
     */
    public async shutdown(options?: { crash?: boolean; stayAlive?: boolean }): Promise<void> {
        if (this.stopping) return;
        this.stopping = true;

        this.logger.info('Stopping server', 'Server/kill');
        await this.console?.disable();

        clearInterval(this.tickerTimer);

        try {
            // Kick all online players.
            for (const player of this.sessionManager.getAllPlayers()) {
                await player.kick('Server closed.');
            }

            // Disable all managers.
            await this.disable();

            // `this.raknet` might be undefined if we kill the server really early.
            try {
                this.raknet.kill();
            } catch {}

            this.getLogger().info('Server stopped, Goodbye!\n');

            if (!options?.stayAlive) process.exit(options?.crash ? 1 : 0);
        } catch (error: unknown) {
            console.error(error);
            if (!options?.stayAlive) process.exit(1);
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
    public getLogger(): Logger {
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
     * @returns {Console | undefined} The console instance.
     */
    public getConsole() {
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
        return Number(this.currentTick);
    }

    /**
     * Returns the current TPS.
     * @returns {number} The current TPS.
     */
    public getTPS(): number {
        return Number.parseFloat(this.tps.toFixed(2));
    }
}
