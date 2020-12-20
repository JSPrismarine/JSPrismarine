import BanManager from './ban/BanManager';
import BatchPacket from './network/packet/BatchPacket';
import BlockManager from './block/BlockManager';
import Chat from './chat/Chat';
import ChatEvent from './events/chat/ChatEvent';
import ChatManager from './chat/ChatManager';
import CommandManager from './command/CommandManager';
import type Config from './config/Config';
import Connection from './network/raknet/Connection';
import Console from './Console';
import { EventManager } from './events/EventManager';
import Identifiers from './network/Identifiers';
import type InetAddress from './network/raknet/utils/InetAddress';
import ItemManager from './item/ItemManager';
import Listener from './network/raknet/Listener';
import type LoggerBuilder from './utils/Logger';
import PacketHandler from './network/handler/PacketHandler';
import PacketRegistry from './network/PacketRegistry';
import PermissionManager from './permission/PermissionManager';
import Player from './player/Player';
import PlayerConnectEvent from './events/player/PlayerConnectEvent';
import { PlayerListEntry } from './network/packet/PlayerListPacket';
import PluginManager from './plugin/PluginManager';
import QueryManager from './query/QueryManager';
import RaknetConnectEvent from './events/raknet/RaknetConnectEvent';
import RaknetDisconnectEvent from './events/raknet/RaknetDisconnectEvent';
import RaknetEncapsulatedPacketEvent from './events/raknet/RaknetEncapsulatedPacketEvent';
import TelemetryManager from './telemetry/TelemeteryManager';
import WorldManager from './world/WorldManager';
import pkg from '../package.json';
import { setIntervalAsync } from 'set-interval-async/dynamic';

export default class Server {
    private raknet!: Listener;
    private logger: LoggerBuilder;
    private config: Config;
    private tps: number = 20;
    private console: Console;

    private players: Map<string, Player> = new Map();
    private playerList: Map<string, PlayerListEntry> = new Map();
    private telemetryManager: TelemetryManager;
    private eventManager = new EventManager();
    private packetRegistry: PacketRegistry;
    private pluginManager: PluginManager;
    private commandManager: CommandManager;
    private worldManager: WorldManager;
    private itemManager: ItemManager;
    private blockManager: BlockManager;
    private queryManager: QueryManager;
    private chatManager: ChatManager;
    private permissionManager: PermissionManager;
    private banManager: BanManager;

    public static instance: Server;

    public constructor({
        logger,
        config
    }: {
        logger: LoggerBuilder;
        config: Config;
    }) {
        logger.info(
            `Starting JSPrismarine server version ${pkg.version} for Minecraft: Bedrock Edition v${Identifiers.MinecraftVersion} (protocol version ${Identifiers.Protocol})`
        );

        this.logger = logger;
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
        await this.permissionManager.onEnable();
        await this.banManager.onEnable();
        await this.itemManager.onEnable();
        await this.blockManager.onEnable();
        await this.commandManager.onEnable();
        await this.pluginManager.onEnable();
        await this.telemetryManager.onEnable();
        // TODO: rework managers to this format
    }
    private async onDisable(): Promise<void> {
        await this.telemetryManager.onDisable();
        await this.pluginManager.onDisable();
        await this.commandManager.onDisable();
        await this.blockManager.onDisable();
        await this.itemManager.onDisable();
        await this.banManager.onDisable();
        await this.permissionManager.onDisable();
        // TODO: rework managers to this format
    }

    public async reload(): Promise<void> {
        this.packetRegistry = new PacketRegistry(this);
        await this.onDisable();
        await this.onEnable();
    }

    public async listen(serverIp = '0.0.0.0', port = 19132): Promise<void> {
        await this.onEnable();
        await this.worldManager.onEnable();

        this.raknet = await new Listener(this).listen(serverIp, port);
        this.raknet.on('openConnection', (connection: Connection) => {
            const event = new RaknetConnectEvent(connection);
            this.getEventManager().emit('raknetConnect', event);
        });
        this.raknet.on(
            'closeConnection',
            (inetAddr: InetAddress, reason: string) => {
                const event = new RaknetDisconnectEvent(inetAddr, reason);
                this.getEventManager().emit('raknetDisconnect', event);
            }
        );
        this.raknet.on('encapsulated', (packet: any, inetAddr: InetAddress) => {
            const event = new RaknetEncapsulatedPacketEvent(inetAddr, packet);
            this.getEventManager().emit('raknetEncapsulatedPacket', event);
        });
        this.raknet.on('raw', (buffer: Buffer, inetAddr: InetAddress) => {
            this.getQueryManager().onRaw(buffer, inetAddr);
        });

        this.logger.info(`JSPrismarine is now listening on port §b${port}`);

        this.getEventManager().on(
            'raknetConnect',
            async (raknetConnectEvent: RaknetConnectEvent) => {
                const connection = raknetConnectEvent.getConnection();

                let inetAddr = connection.getAddress();

                // TODO: Get last world by player data
                // and if it doesn't exists, return the default one
                let time = Date.now();
                let world = this.getWorldManager().getDefaultWorld();
                if (!world) throw new Error('No world'); // Temp solution

                let player = new Player(
                    connection,
                    connection.getAddress(),
                    world,
                    this
                );

                // Emit playerConnect event
                const playerConnectEvent = new PlayerConnectEvent(
                    player,
                    inetAddr
                );
                await this.getEventManager().emit(
                    'playerConnect',
                    playerConnectEvent
                );
                if (playerConnectEvent.cancelled)
                    throw new Error('Event canceled');

                this.players.set(
                    `${inetAddr.getAddress()}:${inetAddr.getPort()}`,
                    player
                );

                // Add the player into the world
                world.addPlayer(player);

                this.logger.silly(
                    `Player creation took about ${Date.now() - time} ms`
                );
            }
        );

        this.getEventManager().on(
            'raknetDisconnect',
            (event: RaknetDisconnectEvent) => {
                const inetAddr = event.getInetAddr();
                const reason = event.getReason();

                const time = Date.now();
                const token = `${inetAddr.getAddress()}:${inetAddr.getPort()}`;
                if (this.players.has(token)) {
                    const player = this.players.get(token) as Player;

                    // Despawn the player to all online players
                    player.getConnection().removeFromPlayerList();
                    for (let onlinePlayer of this.players.values()) {
                        player.getConnection().sendDespawn(onlinePlayer);
                    }

                    // Announce disconnection
                    const event = new ChatEvent(
                        new Chat(
                            this.getConsole(),
                            `§e${player.getUsername()} left the game`
                        )
                    );
                    this.getEventManager().emit('chat', event);

                    player.getWorld().removePlayer(player); // TODO: player.close();
                    this.players.delete(token);
                } else {
                    this.logger.debug(
                        `Cannot remove connection from unexisting player (${token})`
                    );
                }

                this.logger.info(`${token} disconnected due to ${reason}`);

                this.logger.silly(
                    `Player destruction took about ${Date.now() - time} ms`
                );
            }
        );

        this.getEventManager().on('raknetEncapsulatedPacket', (event) => {
            const raknetPacket = event.getPacket();
            const inetAddr = event.getInetAddr();

            const token = `${inetAddr.getAddress()}:${inetAddr.getPort()}`;
            if (!this.players.has(token)) return;
            const player = this.players.get(token);

            // Read batch content and handle them
            const batched = new BatchPacket(raknetPacket.buffer);
            batched.decode();

            // Read all packets inside batch and handle them
            for (const buf of (batched as BatchPacket).getPackets()) {
                if (!this.packetRegistry.getPackets().has(buf[0])) {
                    this.logger.error(
                        `Packet ${raknetPacket.id} doesn't have a handler`
                    );
                    continue;
                }

                // Get packet from registry
                const packet = new (this.packetRegistry
                    .getPackets()
                    .get(buf[0]))(buf);

                try {
                    packet.decode();
                } catch (err) {
                    this.logger.error(
                        `Error while decoding packet: ${packet.constructor.name}: ${err}`
                    );
                    continue;
                }

                const handler = this.packetRegistry.getPacketHandler(
                    packet.getId()
                );
                if (handler == null) {
                    continue;
                }

                try {
                    (handler as PacketHandler<any>).handle(
                        packet,
                        this,
                        player as Player
                    );
                } catch (err) {
                    this.logger.error(
                        `Handler error ${packet.constructor.name}-handler: (${err})`
                    );
                }
            }
        });

        // Tick worlds every 1/20 of a second (a minecraft tick)
        let startTime = Date.now();
        setIntervalAsync(async () => {
            const promises: Array<Promise<void>> = [];
            for (const world of this.getWorldManager().getWorlds()) {
                promises.push(world.update(startTime));
            }
            await Promise.all(promises);

            // Calculate current tps
            const finishTime = Date.now();
            this.tps =
                Math.round((1000 / (finishTime - startTime)) * 100) / 100;
            startTime = finishTime;
        }, 50);

        // Auto save (default: 5 minutes)
        // TODO: level.ticks % 6000 == 0 and save
        // setInterval(
        //    () =>
        //        this.getWorldManager()
        //            .getWorlds()
        //            .map(async (world) => await world.save()),
        //    1000 * 60 * 5
        // );
    }

    /**
     * Returns an array containing all online players.
     */
    public getOnlinePlayers(): Array<Player> {
        return Array.from(this.players.values());
    }

    /**
     * Returns an online player by its runtime ID,
     * if it is not found, null is returned.
     */
    public getPlayerById(id: bigint): Player | null {
        return (
            this.getOnlinePlayers().find((player) => player.runtimeId == id) ??
            null
        );
    }

    /**
     * Returns an online player by its name,
     * if it is not found, null is returned.
     *
     * CASE INSENSITIVE.
     * MATCH IF STARTS WITH
     * Example getPlayerByName("John") may return
     * an user with username "John Doe"
     */
    public getPlayerByName(name: string): Player | null {
        return (
            Array.from(this.players.values()).find((player) =>
                player
                    .getUsername()
                    .toLowerCase()
                    .startsWith(name.toLowerCase())
            ) ?? null
        );
    }

    /**
     * Returns an online player by its name,
     * if it is not found, null is returned.
     *
     * CASE SENSITIVE.
     */
    public getPlayerByExactName(name: string): Player | null {
        return (
            this.getOnlinePlayers().find(
                (player) => player.getUsername() === name
            ) ?? null
        );
    }

    /**
     * Kills the server asynchronously.
     */
    public async kill(): Promise<void> {
        try {
            // Kick all online players
            for (let player of this.getOnlinePlayers()) {
                await player.kick('Server closed.');
            }

            // Save all worlds
            for (let world of this.getWorldManager().getWorlds()) {
                await world.save();
            }

            await this.worldManager.onDisable();
            await this.onDisable();
            process.exit(0);
        } catch (err) {
            this.getLogger().error(err);
            process.exit(1);
        }
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
     * Returns the player list
     */
    public getPlayerList(): Map<string, PlayerListEntry> {
        return this.playerList;
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
}
