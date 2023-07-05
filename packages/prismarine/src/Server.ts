import Chat, { ChatType } from './chat/Chat.js';
import { InetAddress, Protocol, RakNetListener, type RakNetSession, SessionV2 } from '@jsprismarine/raknet';

import BanManager from './ban/BanManager.js';
import BatchPacket from './network/packet/BatchPacket.js';
import BlockManager from './block/BlockManager.js';
import BlockMappings from './block/BlockMappings.js';
import ChatEvent from './events/chat/ChatEvent.js';
import ChatManager from './chat/ChatManager.js';
import ClientConnection from './network/ClientConnection.js';
import CommandManager from './command/CommandManager.js';
import type Config from './config/Config.js';
import Console from './Console.js';
import { DataPacket } from './network/Packets.js';
import { EventManager } from './events/EventManager.js';
import Identifiers from './network/Identifiers.js';
import ItemManager from './item/ItemManager.js';
import type LoggerBuilder from './utils/Logger.js';
import PacketRegistry from './network/PacketRegistry.js';
import PermissionManager from './permission/PermissionManager.js';
import PluginManager from './plugin/PluginManager.js';
import QueryManager from './query/QueryManager.js';
import RaknetConnectEvent from './events/raknet/RaknetConnectEvent.js';
import RaknetDisconnectEvent from './events/raknet/RaknetDisconnectEvent.js';
import RaknetEncapsulatedPacketEvent from './events/raknet/RaknetEncapsulatedPacketEvent.js';
import SessionManager from './SessionManager.js';
import TelemetryManager from './telemetry/TelemeteryManager.js';
import { TickEvent } from './events/Events.js';
import Timer from './utils/Timer.js';
import WorldManager from './world/WorldManager.js';

export default class Server {
    private version!: string;
    private raknet!: RakNetListener;
    private readonly logger: LoggerBuilder;
    private readonly config: Config;
    private tps = 20;
    private tpsHistory!: number[];
    private readonly console: Console;
    private readonly telemetryManager: TelemetryManager;
    private readonly eventManager = new EventManager();
    private readonly packetRegistry: PacketRegistry;
    private readonly sessionManager = new SessionManager();
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

    private static readonly MINECRAFT_TICK_TIME_MS = 50;

    private tickerTimer: NodeJS.Timeout | null = null;

    /**
     * @deprecated
     */
    public static instance: Server;

    public constructor({ logger, config, version }: { logger?: LoggerBuilder; config: Config; version: string }) {
        logger?.info(
            `Starting JSPrismarine server version ${version} for Minecraft: Bedrock Edition v${Identifiers.MinecraftVersion} (protocol version ${Identifiers.Protocol})`,
            'Server'
        );

        this.version = version;
        this.logger = logger!;
        this.config = config;
        this.telemetryManager = new TelemetryManager(this);
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
        await this.permissionManager.onEnable();
        await this.pluginManager.onEnable();
        await this.banManager.onEnable();
        await this.itemManager.onEnable();
        await this.blockManager.onEnable();
        await this.commandManager.onEnable();
        await this.telemetryManager.onEnable();
    }

    private async onDisable(): Promise<void> {
        await this.telemetryManager.onDisable();
        await this.commandManager.onDisable();
        await this.blockManager.onDisable();
        await this.itemManager.onDisable();
        await this.banManager.onDisable();
        await this.pluginManager.onDisable();
        await this.permissionManager.onDisable();
        await this.packetRegistry.onDisable();
        this.config.onDisable();
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

        this.raknet = new RakNetListener(this.getConfig().getMaxPlayers(), false);
        this.raknet.start(serverIp, port);

        this.raknet.on('openConnection', async (session: SessionV2) => {
            // const event = new RaknetConnectEvent(session);
            // await this.eventManager.emit('raknetConnect', event);

            // if (event.isCancelled()) {
            //    session.disconnect();
            //    return;
            // }

            const token = session.getAddress().toToken();
            if (this.sessionManager.has(token)) {
                this.logger?.error(
                    `Another client with token (${token}) is already connected!`,
                    'Server/listen/openConnection'
                );
                // session.disconnect('Already connected from another location');
                return;
            }

            const timer = new Timer();
            this.logger?.debug(`${token} is attempting to connect`, 'Server/listen/openConnection');
            this.sessionManager.add(token, new ClientConnection(session, this.logger));
            this.logger?.verbose(`New connection handling took ${timer.stop()} ms`, 'Server/listen/openConnection');
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
                            `§e%multiplayer.player.left`,
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
            } catch (error) {
                this.logger?.debug(
                    `Cannot remove connection from non-existing player (${token})`,
                    'Server/listen/raknetDisconnect'
                );
                this.logger?.debug((error as any).stack, 'Server/listen/raknetDisconnect');
            }

            this.logger?.debug(`${token} disconnected due to ${reason}`, 'Server/listen/raknetDisconnect');

            this.logger?.debug(
                `Player destruction took about ${Date.now() - time} ms`,
                'Server/listen/raknetDisconnect'
            );
        });

        this.raknet.on('encapsulated', async (packet: Buffer, inetAddr: InetAddress) => {
            const event = new RaknetEncapsulatedPacketEvent(inetAddr, packet);
            await this.eventManager.emit('raknetEncapsulatedPacket', event);

            let connection: ClientConnection | null;
            if ((connection = this.sessionManager.get(inetAddr.toToken()) ?? null) === null) {
                this.logger?.error(`Got a packet from a closed connection (${inetAddr.toToken()})`);
                return;
            }

            try {
                // Read batch content and handle them
                const batched = new BatchPacket(packet);
                batched.compressed = connection.hasCompression;

                // Read all packets inside batch and handle them
                for (const buf of await batched.asyncDecode()) {
                    const pid = buf[0];

                    if (!this.packetRegistry.getPackets().has(pid)) {
                        this.logger?.warn(
                            `Packet 0x${pid.toString(16)} isn't implemented`,
                            'Server/listen/raknetEncapsulatedPacket'
                        );
                        continue;
                    }

                    // Get packet from registry
                    const packet = new (this.packetRegistry.getPackets().get(pid)!)(buf);

                    try {
                        packet.decode();
                    } catch (error) {
                        this.logger?.error(
                            `Error while decoding packet: ${packet.constructor.name}: ${error}`,
                            'Server/listen/raknetEncapsulatedPacket'
                        );
                        continue;
                    }

                    try {
                        const handler = this.packetRegistry.getHandler(pid);
                        this.logger?.silly(
                            `Received §b${packet.constructor.name}§r packet`,
                            'Server/listen/raknetEncapsulatedPacket'
                        );
                        await (handler as any).handle(packet, this, connection.getPlayerSession() ?? connection);
                    } catch (error) {
                        this.logger?.error(
                            `Handler error ${packet.constructor.name}-handler: (${error})`,
                            'Server/listen/raknetEncapsulatedPacket'
                        );
                        this.logger?.debug(`${(error as any).stack}`, 'Server/listen/raknetEncapsulatedPacket');
                    }
                }
            } catch (error) {
                this.logger?.error(error as any, 'Server/listen/raknetEncapsulatedPacket');
            }
        });

        this.raknet.on('raw', async (buffer: Buffer, inetAddr: InetAddress) => {
            try {
                await this.queryManager.onRaw(buffer, inetAddr);
            } catch (error) {
                this.logger?.verbose(`QueryManager failed with error: ${error}`, 'Server/listen/raw');
                this.logger?.debug((error as any).stack, 'Server/listen/raw');
            }
        });

        let tickCount = 0;
        const tick = () =>
            setTimeout(() => {
                const event = new TickEvent(tickCount);
                void this.eventManager.emit('tick', event);

                for (const world of this.worldManager.getWorlds()) {
                    void world.update(event.getTick());
                }

                ++tickCount;
                tick();
            }, Server.MINECRAFT_TICK_TIME_MS);

        // Start ticking
        // TODO: the tick depends on the world
        // TODO: ticks have to be sync... what if a newer update
        // takes less to complete than the one started before?
        // will lead to desyncronized gameplay
        this.tickerTimer = tick();
        this.tickerTimer.unref();

        // Log experimental flags
        if (this.config.getExperimentalFlags().length >= 1) {
            this.logger?.debug(`Enabled flags:`, 'Server/listen');
            this.config.getExperimentalFlags().forEach((flag) => this.logger?.debug(`- ${flag}`, 'Server/listen'));
        }

        this.logger?.info(`JSPrismarine is now listening on port §b${port}`, 'Server/listen');
    }

    /**
     * Kills the server asynchronously.
     */
    public async shutdown(options?: { withoutSaving?: boolean; crash?: boolean }): Promise<void> {
        if (this.stopping) return;
        this.stopping = true;

        this.logger?.info('Stopping server', 'Server/kill');
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
            this.raknet?.kill(); // this.raknet might be undefined if we kill the server really early
            process.exit(options?.crash ? 1 : 0);
        } catch (error) {
            this.logger?.error(error as any, 'Server/kill');
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
    public getSessionManager(): SessionManager {
        return this.sessionManager;
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
     * Returns the raknet instance
     */
    public getRaknet() {
        return this.raknet;
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
        if (!this.config.getExperimentalFlags().includes('ticks')) return 20;

        return this.tps;
    }

    /**
     * Returns the current TPS
     */
    public getAverageTPS(): {
        one: number;
        five: number;
        ten: number;
    } {
        if (!this.config.getExperimentalFlags().includes('ticks'))
            return {
                one: 20,
                five: 20,
                ten: 20
            };

        let one = 0;
        for (let i = 10800; i < this.tpsHistory.length; i++) one += this.tpsHistory[i];
        one = Math.round(one / 1200);

        let five = 0;
        for (let i = 6000; i < this.tpsHistory.length; i++) five += this.tpsHistory[i];
        five = Math.round(five / 6000);

        let ten = 0;
        for (let i = 0; i < this.tpsHistory.length; i++) ten += this.tpsHistory[i];
        ten = Math.round(ten / 12000);

        return {
            one,
            five,
            ten
        };
    }
}
