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
import EncapsulatedPacket from './network/raknet/protocol/EncapsulatedPacket';
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
import World from './world/World';
import WorldManager from './world/WorldManager';
import pkg from '../package.json';
import { setIntervalAsync } from 'set-interval-async/dynamic';

export default class Server {
    private raknet!: Listener;
    private readonly logger: LoggerBuilder;
    private readonly config: Config;
    private tps = 20;
    private readonly tpsHistory: number[];
    private readonly console: Console;

    private readonly players: Map<string, Player> = new Map();
    private readonly playerList: Map<string, PlayerListEntry> = new Map();
    private readonly telemetryManager: TelemetryManager;
    private readonly eventManager = new EventManager();
    private packetRegistry: PacketRegistry;
    private readonly pluginManager: PluginManager;
    private readonly commandManager: CommandManager;
    private readonly worldManager: WorldManager;
    private readonly itemManager: ItemManager;
    private readonly blockManager: BlockManager;
    private readonly queryManager: QueryManager;
    private readonly chatManager: ChatManager;
    private readonly permissionManager: PermissionManager;
    private readonly banManager: BanManager;

    public static instance: Server;

    public constructor({
        logger,
        config
    }: {
        logger: LoggerBuilder;
        config: Config;
    }) {
        logger.info(
            `Starting JSPrismarine server version ${pkg.version} for Minecraft: Bedrock Edition v${Identifiers.MinecraftVersion} (protocol version ${Identifiers.Protocol})`,
            'Server'
        );

        this.logger = logger;
        this.config = config;
        this.tpsHistory = new Array(12000).fill(20);
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
    }

    private async onDisable(): Promise<void> {
        await this.telemetryManager.onDisable();
        await this.pluginManager.onDisable();
        await this.commandManager.onDisable();
        await this.blockManager.onDisable();
        await this.itemManager.onDisable();
        await this.banManager.onDisable();
        await this.permissionManager.onDisable();
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
        this.raknet.on('openConnection', async (connection: Connection) => {
            const event = new RaknetConnectEvent(connection);
            await this.getEventManager().emit('raknetConnect', event);
        });

        this.raknet.on(
            'closeConnection',
            async (inetAddr: InetAddress, reason: string) => {
                const event = new RaknetDisconnectEvent(inetAddr, reason);
                await this.getEventManager().emit('raknetDisconnect', event);
            }
        );

        this.raknet.on(
            'encapsulated',
            async (packet: EncapsulatedPacket, inetAddr: InetAddress) => {
                const event = new RaknetEncapsulatedPacketEvent(
                    inetAddr,
                    packet
                );
                await this.getEventManager().emit(
                    'raknetEncapsulatedPacket',
                    event
                );
            }
        );

        this.raknet.on('raw', async (buffer: Buffer, inetAddr: InetAddress) => {
            try {
                await this.getQueryManager().onRaw(buffer, inetAddr);
            } catch {}
        });

        this.logger.info(
            `JSPrismarine is now listening on port §b${port}`,
            'Server/listen'
        );

        this.getEventManager().on(
            'raknetConnect',
            async (raknetConnectEvent: RaknetConnectEvent) => {
                const connection = raknetConnectEvent.getConnection();

                // TODO: Get last world by player data
                // and if it doesn't exists, return the default one
                const time = Date.now();
                const world = this.getWorldManager().getDefaultWorld()!;

                const player = new Player(connection, world, this);

                // Emit playerConnect event
                const playerConnectEvent = new PlayerConnectEvent(
                    player,
                    player.getAddress()
                );

                await this.getEventManager().emit(
                    'playerConnect',
                    playerConnectEvent
                );

                if (playerConnectEvent.cancelled)
                    throw new Error('Event canceled');

                this.players.set(
                    `${player
                        .getAddress()
                        .getAddress()}:${player.getAddress().getPort()}`,
                    player
                );

                // Add the player into the world
                world.addPlayer(player);

                this.logger.silly(
                    `Player creation took about ${Date.now() - time} ms`,
                    'Server/listen/raknetConnect'
                );
            }
        );

        this.getEventManager().on(
            'raknetDisconnect',
            async (event: RaknetDisconnectEvent) => {
                const inetAddr = event.getInetAddr();
                const reason = event.getReason();

                const time = Date.now();
                const token = `${inetAddr.getAddress()}:${inetAddr.getPort()}`;
                if (this.players.has(token)) {
                    const player = this.players.get(token) as Player;

                    // Despawn the player to all online players
                    await player.getConnection().removeFromPlayerList();
                    for (const onlinePlayer of this.players.values()) {
                        await player.getConnection().sendDespawn(onlinePlayer);
                    }

                    // Sometimes we fail at decoding the username for whatever reason
                    if (player.getUsername()) {
                        // Announce disconnection
                        const event = new ChatEvent(
                            new Chat(
                                this.getConsole(),
                                `§e${player.getUsername()} left the game`
                            )
                        );
                        await this.getEventManager().emit('chat', event);
                    }

                    await player.onDisable();
                    player.getWorld().removePlayer(player);
                    this.players.delete(token);
                } else {
                    this.logger.debug(
                        `Cannot remove connection from non-existing player (${token})`,
                        'Server/listen/raknetDisconnect'
                    );
                }

                this.logger.info(
                    `${token} disconnected due to ${reason}`,
                    'Server/listen/raknetDisconnect'
                );

                this.logger.silly(
                    `Player destruction took about ${Date.now() - time} ms`,
                    'Server/listen/raknetDisconnect'
                );
            }
        );

        this.getEventManager().on('raknetEncapsulatedPacket', async (event) => {
            const raknetPacket = event.getPacket();
            const inetAddr = event.getInetAddr();

            const token = `${inetAddr.getAddress()}:${inetAddr.getPort()}`;
            if (!this.players.has(token)) return;
            const player = this.players.get(token);

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
                const packet = new (this.packetRegistry
                    .getPackets()
                    .get(buf[0]))(buf);

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
                    const handler = this.packetRegistry.getPacketHandler(
                        packet.getId()
                    );

                    await (handler as PacketHandler<any>).handle(
                        packet,
                        this,
                        player as Player
                    );
                } catch (error) {
                    this.logger.error(
                        `Handler error ${packet.constructor.name}-handler: (${error})`,
                        'Server/listen/raknetEncapsulatedPacket'
                    );
                    this.logger.debug(
                        `${error.stack}`,
                        'Server/listen/raknetEncapsulatedPacket'
                    );
                }
            }
        });

        // Tick worlds every 1/20 of a second (a minecraft tick)
        // e.g. 1000 / 20 = 50
        let startTime = Date.now();
        setIntervalAsync(async () => {
            // Calculate current tps
            const finishTime = Date.now();
            this.tps =
                Math.round((1000 / (finishTime - startTime)) * 100) / 100;

            this.tpsHistory.push(this.tps);
            if (this.tpsHistory.length > 12000) this.tpsHistory.shift();

            // Make sure we never execute more than once every 20th of a second
            if (finishTime - startTime < 50) return;
            startTime = finishTime;

            if (this.tps > 20)
                return this.getLogger().debug(
                    `TPS is ${this.tps} which is greater than 20!`,
                    'Server/listen/setIntervalAsync'
                );

            const promises: Array<Promise<void>> = [];
            for (const world of this.getWorldManager().getWorlds()) {
                promises.push(world.update(startTime));
            }

            await Promise.all(promises);
        }, 50);
    }

    /**
     * Returns an array containing all online players.
     */
    public getOnlinePlayers(): Player[] {
        return Array.from(this.players.values());
    }

    /**
     * Returns an online player by its runtime ID,
     * if it is not found, null is returned.
     */
    public getPlayerById(id: bigint): Player | null {
        return (
            this.getOnlinePlayers().find((player) => player.runtimeId === id) ??
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
    public getPlayerByName(name: string): Player {
        const player = Array.from(this.players.values()).find((player) =>
            player.getUsername().toLowerCase().startsWith(name.toLowerCase())
        );

        if (!player) throw new Error(`Can't find player ${name}`);

        return player;
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
            for (const player of this.getOnlinePlayers()) {
                await player.kick('Server closed.');
            }

            // Save all worlds
            for (const world of this.getWorldManager().getWorlds()) {
                await world.save();
                await world.close();
            }

            await this.worldManager.onDisable();
            await this.onDisable();
            await this.raknet?.kill(); // this.raknet might be undefined if we kill the server early
            process.exit(0);
        } catch (error) {
            this.getLogger().error(error, 'Server/kill');
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

    /**
     * Returns the current TPS
     */
    public getAverageTPS() {
        let one = 0;
        for (let i = 10800; i < this.tpsHistory.length; i++)
            one += this.tpsHistory[i];
        one = Math.round(one / 1200);

        let five = 0;
        for (let i = 6000; i < this.tpsHistory.length; i++)
            five += this.tpsHistory[i];
        five = Math.round(five / 6000);

        let ten = 0;
        for (let i = 0; i < this.tpsHistory.length; i++)
            ten += this.tpsHistory[i];
        ten = Math.round(ten / 12000);

        return {
            one,
            five,
            ten
        };
    }
}
