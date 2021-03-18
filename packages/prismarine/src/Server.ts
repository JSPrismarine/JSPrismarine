import { Connection, InetAddress, Listener, Protocol } from '@jsprismarine/raknet';

import BanManager from './ban/BanManager';
import BatchPacket from './network/packet/BatchPacket';
import BlockManager from './block/BlockManager';
import BlockMappings from './block/BlockMappings';
import Chat from './chat/Chat';
import ChatEvent from './events/chat/ChatEvent';
import ChatManager from './chat/ChatManager';
import CommandManager from './command/CommandManager';
import type Config from './config/Config';
import Console from './Console';
import { EventManager } from './events/EventManager';
import Identifiers from './network/Identifiers';
import ItemManager from './item/ItemManager';
import type LoggerBuilder from './utils/Logger';
import PacketRegistry from './network/PacketRegistry';
import PermissionManager from './permission/PermissionManager';
import Player from './player/Player';
import PlayerConnectEvent from './events/player/PlayerConnectEvent';
import PlayerManager from './player/PlayerManager';
import PluginManager from './plugin/PluginManager';
import QueryManager from './query/QueryManager';
import RaknetConnectEvent from './events/raknet/RaknetConnectEvent';
import RaknetDisconnectEvent from './events/raknet/RaknetDisconnectEvent';
import RaknetEncapsulatedPacketEvent from './events/raknet/RaknetEncapsulatedPacketEvent';
import TelemetryManager from './telemetry/TelemeteryManager';
import Timer from './utils/Timer';
import WorldManager from './world/WorldManager';
import { setIntervalAsync } from 'set-interval-async/dynamic';

export default class Server {
    private version!: String;
    private raknet!: Listener;
    private readonly logger: LoggerBuilder;
    private readonly config: Config;
    private tps = 20;
    private readonly tpsHistory: number[];
    private readonly console: Console;
    private readonly telemetryManager: TelemetryManager;
    private readonly eventManager = new EventManager();
    private packetRegistry: PacketRegistry;
    private playerManager: PlayerManager;
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

    /**
     * @deprecated
     */
    public static instance: Server;

    public constructor({ logger, config, version }: { logger: LoggerBuilder; config: Config; version: string }) {
        logger.info(
            `Starting JSPrismarine server version ${version} for Minecraft: Bedrock Edition v${Identifiers.MinecraftVersion} (protocol version ${Identifiers.Protocol})`,
            'Server'
        );

        this.version = version;
        this.logger = logger;
        this.config = config;
        this.tpsHistory = new Array(12000).fill(20);
        this.telemetryManager = new TelemetryManager(this);
        this.console = new Console(this);
        this.packetRegistry = new PacketRegistry(this);
        this.playerManager = new PlayerManager(this);
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
        await BlockMappings.initMappings();
        await this.packetRegistry.onEnable();
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
        this.packetRegistry = new PacketRegistry(this);
        await this.onDisable();
        await this.onEnable();
    }

    public async listen(serverIp = '0.0.0.0', port = 19132): Promise<void> {
        await this.onEnable();
        await this.worldManager.onEnable();

        this.raknet = await new Listener(this as any).listen(serverIp, port);
        this.raknet.on('openConnection', async (connection: Connection) => {
            const event = new RaknetConnectEvent(connection);
            await this.getEventManager().emit('raknetConnect', event);
        });

        this.raknet.on('closeConnection', async (inetAddr: InetAddress, reason: string) => {
            const event = new RaknetDisconnectEvent(inetAddr, reason);
            await this.getEventManager().emit('raknetDisconnect', event);
        });

        this.raknet.on('encapsulated', async (packet: Protocol.EncapsulatedPacket, inetAddr: InetAddress) => {
            const event = new RaknetEncapsulatedPacketEvent(inetAddr, packet);
            await this.getEventManager().emit('raknetEncapsulatedPacket', event);
        });

        this.raknet.on('raw', async (buffer: Buffer, inetAddr: InetAddress) => {
            try {
                await this.getQueryManager().onRaw(buffer, inetAddr);
            } catch (error) {
                this.getLogger().debug(`QueryManager failed with error: ${error}`, 'Server/listen/raw');
                this.getLogger().silly(error.stack, 'Server/listen/raw');
            }
        });

        this.logger.info(`JSPrismarine is now listening on port §b${port}`, 'Server/listen');

        this.getEventManager().on('raknetConnect', async (raknetConnectEvent: RaknetConnectEvent) => {
            const connection = raknetConnectEvent.getConnection();
            const token = `${connection.getAddress().getAddress()}:${connection.getAddress().getPort()}`;

            this.logger.debug(`${token} is attempting to connect`, 'Server/listen/raknetDisconnect');

            // TODO: Get last world by player data
            // and if it doesn't exists, return the default one
            const timer = new Timer();
            const world = this.getWorldManager().getDefaultWorld()!;

            const player = new Player(connection, world, this);

            // Emit playerConnect event
            const playerConnectEvent = new PlayerConnectEvent(player, player.getAddress());

            await this.getEventManager().emit('playerConnect', playerConnectEvent);

            if (playerConnectEvent.cancelled) return;

            await this.playerManager.removePlayer(token); // Try to remove player before creating it
            await this.playerManager.addPlayer(token, player);

            // Add the player into the world
            world.addPlayer(player);

            this.logger.silly(`Player creation took ${timer.stop()} ms`, 'Server/listen/raknetConnect');
        });

        this.getEventManager().on('raknetDisconnect', async (event: RaknetDisconnectEvent) => {
            const inetAddr = event.getInetAddr();
            const reason = event.getReason();

            const time = Date.now();
            const token = `${inetAddr.getAddress()}:${inetAddr.getPort()}`;
            try {
                const player = this.playerManager.getPlayer(token);

                // De-spawn the player to all online players
                await player.getConnection().removeFromPlayerList();
                for (const onlinePlayer of this.playerManager.getOnlinePlayers()) {
                    await player.getConnection().sendDespawn(onlinePlayer);
                }

                // Sometimes we fail at decoding the username for whatever reason
                if (player.getName()) {
                    // Announce disconnection
                    const event = new ChatEvent(new Chat(this.getConsole(), `§e${player.getName()} left the game`));
                    await this.getEventManager().emit('chat', event);
                }

                await player.onDisable();
                player.getWorld().removePlayer(player);
                await this.playerManager.removePlayer(token);
            } catch (error) {
                this.logger.debug(
                    `Cannot remove connection from non-existing player (${token})`,
                    'Server/listen/raknetDisconnect'
                );
                this.logger.silly(error.stack, 'Server/listen/raknetDisconnect');
            }

            this.logger.debug(`${token} disconnected due to ${reason}`, 'Server/listen/raknetDisconnect');

            this.logger.silly(
                `Player destruction took about ${Date.now() - time} ms`,
                'Server/listen/raknetDisconnect'
            );
        });

        this.getEventManager().on('raknetEncapsulatedPacket', async (event) => {
            const raknetPacket = event.getPacket();
            const inetAddr = event.getInetAddr();

            const token = `${inetAddr.getAddress()}:${inetAddr.getPort()}`;

            try {
                const player = this.playerManager.getPlayer(token);

                // Read batch content and handle them
                const batched = new BatchPacket(raknetPacket.buffer);
                batched.decode();

                // Read all packets inside batch and handle them
                for (const buf of batched.getPackets()) {
                    const pid = buf[0];
                    if (!this.packetRegistry.getPackets().has(pid)) {
                        this.logger.error(
                            `Packet 0x${pid.toString(16)} isn't implemented`,
                            'Server/listen/raknetEncapsulatedPacket'
                        );
                        continue;
                    }

                    // Get packet from registry
                    const packet = new (this.packetRegistry.getPackets().get(buf[0])!)(buf);

                    try {
                        packet.decode();
                    } catch (error) {
                        this.logger.error(
                            `Error while decoding packet: ${packet.constructor.name}: ${error}`,
                            'Server/listen/raknetEncapsulatedPacket'
                        );
                        continue;
                    }

                    try {
                        const handler = this.packetRegistry.getHandler(packet.getId());
                        await handler.handle(packet, this, player);
                    } catch (error) {
                        this.logger.error(
                            `Handler error ${packet.constructor.name}-handler: (${error})`,
                            'Server/listen/raknetEncapsulatedPacket'
                        );
                        this.logger.debug(`${error.stack}`, 'Server/listen/raknetEncapsulatedPacket');
                    }
                }
            } catch (error) {
                this.logger.error(error, 'Server/listen/raknetEncapsulatedPacket');
            }
        });

        // Tick worlds every 1/20 of a second (a minecraft tick)
        // e.g. 1000 / 20 = 50
        const startTime = Date.now();
        let lastTime = Date.now(),
            ticks = 0;
        const tick = async () => {
            ticks += 1;

            // Calculate current tps
            const finishTime = Date.now();
            this.tps = Math.round((1000 / (finishTime - lastTime)) * 100) / 100;

            this.tpsHistory.push(this.tps);
            if (this.tpsHistory.length > 12000) this.tpsHistory.shift();

            // Make sure we never execute more than once every 20th of a second
            if (finishTime - lastTime < 50) return;
            lastTime = finishTime;

            if (this.tps > 20) {
                this.getLogger().debug(
                    `TPS is ${this.tps} which is greater than 20! Are we recovering?`,
                    'Server/listen/setIntervalAsync'
                );
                return;
            }

            const promises: Array<Promise<void>> = [];
            for (const world of this.getWorldManager().getWorlds()) {
                promises.push(world.update(lastTime));
            }

            await Promise.all(promises);
        };
        setIntervalAsync(tick, 1000 / 20);

        setInterval(() => {
            const correctTicks = Math.ceil((Date.now() - startTime) / 50);
            const behindTicks = correctTicks - (ticks + 1); // Add 1 to compensate for sometimes being off with a few ms

            if (behindTicks) {
                this.getLogger().silly(
                    `We're behind with ${behindTicks} ticks. ${ticks}/${correctTicks}. Trying to recover!`,
                    'server'
                );

                // Try to recover,
                // maybe we should handle this differently?
                // (eg keep track of the correct timestamps)
                for (let i = 0; i < behindTicks; i++) void tick();
            }

            if (behindTicks < 20) return;
            this.getLogger().warn(
                `Can't keep up, is the server overloaded? (${behindTicks} tick(s) or ${
                    behindTicks / 20
                } second(s) behind)`,
                'Server'
            );
        }, 60 * 1000);
    }

    /**
     * Kills the server asynchronously.
     */
    public async kill(options?: { withoutSaving?: boolean; crash?: boolean }): Promise<void> {
        if (this.stopping) return;
        this.stopping = true;

        this.getLogger().info('Stopping server', 'Server/kill');
        await this.console.onDisable();

        try {
            // Kick all online players
            for (const player of this.getPlayerManager().getOnlinePlayers()) {
                await player.kick('Server closed.');
            }

            // Save all worlds
            if (!options?.withoutSaving) await this.worldManager.save();

            await this.worldManager.onDisable();
            await this.onDisable();
            await this.raknet?.kill(); // this.raknet might be undefined if we kill the server really early
            process.exit(options?.crash ? 1 : 0);
        } catch (error) {
            this.getLogger().error(error, 'Server/kill');
            process.exit(1);
        }
    }

    public getVersion() {
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
    public getLogger(): LoggerBuilder {
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
        return this.tps;
    }

    /**
     * Returns the current TPS
     */
    public getAverageTPS() {
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
