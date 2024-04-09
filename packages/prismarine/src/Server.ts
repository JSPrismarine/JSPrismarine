import BanManager from './ban/BanManager';
import BlockManager from './block/BlockManager';
import { BlockMappings } from './block/BlockMappings';
import ChatManager from './chat/ChatManager';
import CommandManager from './command/CommandManager';
import Console from './Console';
import { EventManager } from './events/EventManager';
import Identifiers from './network/Identifiers';
import ItemManager from './item/ItemManager';
import PacketRegistry from './network/PacketRegistry';
import PermissionManager from './permission/PermissionManager';
import PluginManager from './plugin/PluginManager';
import QueryManager from './query/QueryManager';
import { TickEvent } from './events/Events';
import WorldManager from './world/WorldManager';

import type Config from './config/Config';
import type LoggerBuilder from './utils/Logger';
import { InterfaceRegistry } from './network/interface/InterfaceRegistry';
import { RaknetInterface } from './network/interface/RaknetInterface';
import type { NetworkPacket } from '@jsprismarine/protocol';
import PlayerManager from './PlayerManager';

export default class Server {
    private version!: string;
    private readonly logger: LoggerBuilder;
    private readonly config: Config;
    private tps = 0;
    private tick = 0;
    private readonly console: Console;
    private readonly eventManager = new EventManager();
    private readonly packetRegistry: PacketRegistry;
    private readonly playerManager = new PlayerManager();
    private readonly networkInterface = new InterfaceRegistry();
    private readonly pluginManager: PluginManager;
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

    private static readonly MINECRAFT_TICK_TIME_MS = 1000 / 20;

    /**
     * @deprecated
     */
    public static instance: Server;

    public constructor({ logger, config, version }: { logger?: LoggerBuilder; config: Config; version: string }) {
        const advertisedVersion =
            Identifiers.MinecraftVersions.length <= 1
                ? `§ev${Identifiers.MinecraftVersions.at(0)}§r`
                : `§ev${Identifiers.MinecraftVersions.at(0)}§r-§ev${Identifiers.MinecraftVersions.at(-1)}§r`;

        logger?.info(
            `Starting JSPrismarine server version §ev${version}§r for Minecraft: Bedrock Edition ${advertisedVersion} (protocol version §e${Identifiers.Protocol}§r)`,
            'Server'
        );

        this.version = version;
        this.logger = logger!;
        this.config = config;
        this.console = new Console(this);
        this.packetRegistry = new PacketRegistry(this);
        this.itemManager = new ItemManager(this);
        this.blockManager = new BlockManager(this);
        this.worldManager = new WorldManager(this);
        this.commandManager = new CommandManager(this);
        this.pluginManager = new PluginManager(this);
        this.queryManager = new QueryManager(this);
        this.chatManager = new ChatManager(this);
        this.permissionManager = new PermissionManager(this);
        this.banManager = new BanManager(this);

        Server.instance = this;
    }

    private async onEnable(): Promise<void> {
        this.config.onEnable();
        await this.logger.onEnable();
        await this.permissionManager.onEnable();
        await this.pluginManager.onEnable();
        await this.banManager.onEnable();
        await this.itemManager.onEnable();
        await this.blockManager.onEnable();
        await this.commandManager.onEnable();
    }

    private async onDisable(): Promise<void> {
        await this.commandManager.onDisable();
        await this.blockManager.onDisable();
        await this.itemManager.onDisable();
        await this.banManager.onDisable();
        await this.pluginManager.onDisable();
        await this.permissionManager.onDisable();
        await this.packetRegistry.onDisable();
        this.config.onDisable();
        await this.logger.onDisable();
    }

    public async reload(): Promise<void> {
        await this.onDisable();
        await this.onEnable();
    }

    public async bootstrap(serverIp = '0.0.0.0', port = 19132): Promise<void> {
        await this.onEnable();
        BlockMappings.initMappings();
        await this.worldManager.onEnable();
        await this.packetRegistry.onEnable();

        // TODO: better implementation, just a prototype for now to simplify the handling
        this.networkInterface.registerInterface(
            new RaknetInterface(this.eventManager, this.logger, this.queryManager, {
                address: serverIp,
                port,
                maxConnections: this.getConfig().getMaxPlayers(),
                offlineMode: false
            })
        );
        this.networkInterface.initialize();

        let startTime = Date.now();
        let tpsStartTime = Date.now();
        let lastTickTime = Date.now();
        let tpsStartTick = this.tick;
        const tick = () => {
            if (this.stopping) return;

            const event = new TickEvent(this.tick);
            void this.eventManager.emit('tick', event);

            const ticksPerSecond = 1000 / Server.MINECRAFT_TICK_TIME_MS;

            for (const intf of this.networkInterface.getInterfaces().values()) {
                intf.tick();
            }

            // Update all worlds
            for (const world of this.worldManager.getWorlds()) {
                void world.update(event.getTick());
            }

            // Update RakNet server name
            if (this.tick % ticksPerSecond === 0) {
                // TODO: this.getNetworkInterfaces().setServerName(buildRakNetServerName(this));
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
        };

        // Start ticking
        tick();

        this.logger.info(`JSPrismarine is now listening on port §b${port}`, 'Server/listen');
    }

    /**
     * Kills the server asynchronously.
     */
    public async shutdown(options?: { withoutSaving?: boolean; crash?: boolean }): Promise<void> {
        if (this.stopping) return;
        this.stopping = true;

        this.logger.info('Stopping server', 'Server/kill');
        await this.console.onDisable();

        clearInterval(this.tickerTimer);

        try {
            // Kick all online players
            for (const player of this.playerManager.getOnlinePlayers()) {
                await player.kick('Server closed.');
            }

            // Save all worlds
            if (!options?.withoutSaving) await this.worldManager.save();

            await this.worldManager.onDisable();
            await this.onDisable();
            this.networkInterface.shutdown();
            process.exit(options?.crash ? 1 : 0);
        } catch (error: unknown) {
            this.logger.error(error, 'Server/kill');
            process.exit(1);
        }
    }

    public async broadcastPacket<T extends NetworkPacket<unknown>>(packet: T): Promise<void> {
        // Maybe i can improve this by using the UDP broadcast, all unconnected clients
        // will ignore the connected packet probably, but may cause issues.
        for (const onlinePlayer of this.playerManager.getOnlinePlayers()) {
            onlinePlayer.getNetworkSession().getConnection().sendNetworkPacket(packet);
        }
    }

    public getVersion(): string {
        return this.version;
    }

    public getIdentifiers() {
        return Identifiers;
    }

    /**
     * Returns the query manager
     */
    public getQueryManager(): QueryManager {
        return this.queryManager;
    }

    /**
     * Returns the command manager
     */
    public getCommandManager(): CommandManager {
        return this.commandManager;
    }

    /**
     * Returns the player manager
     */
    public getPlayerManager(): PlayerManager {
        return this.playerManager;
    }

    /**
     * Returns the world manager
     */
    public getWorldManager(): WorldManager {
        return this.worldManager;
    }

    /**
     * Returns the item manager
     */
    public getItemManager(): ItemManager {
        return this.itemManager;
    }

    /**
     * Returns the block manager
     */
    public getBlockManager(): BlockManager {
        return this.blockManager;
    }

    /**
     * Returns the logger
     */
    public getLogger(): LoggerBuilder | undefined {
        return this.logger;
    }

    /**
     * Returns the packet registry
     */
    public getPacketRegistry(): PacketRegistry {
        return this.packetRegistry;
    }

    /**
     * Returns the registered network instances
     */
    public getNetworkInterfaces() {
        return this.networkInterface.getInterfaces();
    }

    /**
     * Returns the plugin manager
     */
    public getPluginManager(): PluginManager {
        return this.pluginManager;
    }

    /**
     * Returns the event manager
     */
    public getEventManager(): EventManager {
        return this.eventManager;
    }

    /**
     * Returns the chat manager
     */
    public getChatManager(): ChatManager {
        return this.chatManager;
    }

    /**
     * Returns the config
     */
    public getConfig(): Config {
        return this.config;
    }

    /**
     * Returns the console instance
     */
    public getConsole(): Console {
        return this.console;
    }

    /**
     * Returns the permission manager
     */
    public getPermissionManager(): PermissionManager {
        return this.permissionManager;
    }

    /**
     * Returns the ban manager
     */
    public getBanManager(): BanManager {
        return this.banManager;
    }

    /**
     * Returns this Prismarine instance
     */
    public getServer(): Server {
        return this;
    }

    /**
     * Returns the current TPS
     */
    public getTPS(): number {
        return this.tps;
    }

    /**
     * Returns the current Tick
     */
    public getTick(): number {
        return this.tick;
    }
}
