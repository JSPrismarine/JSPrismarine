import { setIntervalAsync } from 'set-interval-async/dynamic';
import PacketRegistry from "./network/packet-registry";
import Player from "./player";
import BlockManager from "./block/BlockManager";
import ItemManager from "./item/ItemManager";
import CommandManager from "./command/CommandManager";
import type Config from "./config";
import WorldManager from "./world/world-manager";
import QueryManager from "./query/QueryManager";
import PluginManager from "./plugin/PluginManager";
import type LoggerBuilder from "./utils/Logger";
import TelemetryManager from "./telemetry/TelemeteryManager";
import pkg from '../package.json';
import { EventManager } from './events/EventManager';
import RaknetConnectEvent from './events/raknet/RaknetConnectEvent';
import PlayerConnectEvent from './events/player/PlayerConnectEvent';
import RaknetDisconnectEvent from './events/raknet/RaknetDisconnectEvent';
import RaknetEncapsulatedPacketEvent from './events/raknet/RaknetEncapsulatedPacketEvent';
import Listener from './network/raknet/Listener';
import BatchPacket from './network/packet/batch';
import Identifiers from './network/Identifiers';
import type InetAddress from './network/raknet/utils/InetAddress';

export default class Prismarine {
    private raknet: any;
    private logger: LoggerBuilder;
    private config: Config;
    private tps: number = 20;

    private players: Map<string, Player> = new Map();
    private telemetryManager: TelemetryManager;
    private eventManager = new EventManager(this);
    private packetRegistry: PacketRegistry;
    private pluginManager: PluginManager;
    private commandManager: CommandManager;
    private worldManager: WorldManager;
    private itemManager: ItemManager;
    private blockManager: BlockManager;
    private queryManager: QueryManager;

    static instance: null | Prismarine = null;

    constructor({ logger, config }: {
        logger: LoggerBuilder,
        config: Config
    }) {
        logger.info(`Starting JSPrismarine server version ${pkg.version} for Minecraft: Bedrock Edition v${Identifiers.MinecraftVersion} (protocol version ${Identifiers.Protocol})`)

        this.logger = logger;
        this.config = config;
        this.telemetryManager = new TelemetryManager(this);
        this.packetRegistry = new PacketRegistry(this);
        this.itemManager = new ItemManager(this);
        this.blockManager = new BlockManager(this);
        this.worldManager = new WorldManager(this);
        this.commandManager = new CommandManager(this);
        this.pluginManager = new PluginManager(this);
        this.queryManager = new QueryManager(this);
        Prismarine.instance = this;
    }

    private async onStart() {
        await this.itemManager.onStart();
        await this.blockManager.onStart();
        await this.commandManager.onStart();
        await this.pluginManager.onStart();
        await this.telemetryManager.onStart();
        // TODO: rework managers to this format
    }
    private async onExit() {
        await this.telemetryManager.onExit();
        await this.pluginManager.onExit();
        await this.commandManager.onExit();
        await this.blockManager.onExit();
        await this.itemManager.onExit();
        // TODO: rework managers to this format
    }

    public async reload() {
        this.packetRegistry = new PacketRegistry(this);
        await this.onExit();
        await this.onStart();
    }

    public async listen(serverIp = '0.0.0.0', port = 19132) {
        await this.onStart();
        await this.worldManager.onStart();

        this.raknet = await (new Listener(this)).listen(serverIp, port);
        this.raknet.getName().setOnlinePlayerCount(this.players.size);
        this.raknet.on('openConnection', (connection: any) => {
            const event = new RaknetConnectEvent(connection);
            this.getEventManager().emit('raknetConnect', event);
        });
        this.raknet.on('closeConnection', (inetAddr: InetAddress, reason: string) => {
            const event = new RaknetDisconnectEvent(
                inetAddr,
                reason
            );
            this.getEventManager().emit('raknetDisconnect', event);
        });
        this.raknet.on('encapsulated', (packet: any, inetAddr: InetAddress) => {
            const event = new RaknetEncapsulatedPacketEvent(
                inetAddr,
                packet
            );
            this.getEventManager().emit('raknetEncapsulatedPacket', event);
        });

        this.logger.info(`JSPrismarine is now listening on port §b${port}`);

        this.getEventManager().on('raknetConnect', async raknetConnectEvent => {
            const connection = raknetConnectEvent.getConnection();

            let inetAddr = connection.address;

            // TODO: Get last world by player data
            // and if it doesn't exists, return the default one
            let time = Date.now();
            {
                let world = this.getWorldManager().getDefaultWorld();
                if (!world)
                    throw new Error("No world");  // Temp solution

                let player = new Player(
                    connection,
                    connection.address,
                    world, this
                );

                // Emit playerConnect event
                const playerConnectEvent = new PlayerConnectEvent(player, inetAddr);
                await this.getEventManager().emit('playerConnect', playerConnectEvent);
                if (playerConnectEvent.cancelled)
                    throw new Error("Event canceled");

                this.players.set(`${inetAddr.address}:${inetAddr.port}`, player);

                // Add the player into the world
                world?.addPlayer(player);
                this.raknet.getName().setOnlinePlayerCount(this.players.size);
            }
            this.logger.silly(`Player creation took about ${Date.now() - time} ms`);

        });

        this.getEventManager().on('raknetDisconnect', event => {
            const inetAddr = event.getInetAddr();
            const reason = event.getReason();

            let time = Date.now();
            {
                let token = `${inetAddr.address}:${inetAddr.port}`;
                if (this.players.has(token)) {
                    let player = this.players.get(token);
                    if (!player) {
                        const message = `Could not find player: ${token}`;
                        this.logger.error(`Could not find player: ${token}`)
                        throw new Error(message);
                    }

                    // Despawn the player to all online players
                    player.removeFromPlayerList();
                    this.players.delete(token);
                    for (let onlinePlayer of this.players.values()) {
                        player.sendDespawn(onlinePlayer);
                    }
                    player.getWorld().removePlayer(player);

                }
                this.logger.info(`${inetAddr.address}:${inetAddr.port} disconnected due to ${reason}`);
                this.raknet.getName().setOnlinePlayerCount(this.players.size);
            }
            this.logger.silly(`Player destruction took about ${Date.now() - time} ms`);

        });

        this.getEventManager().on('raknetEncapsulatedPacket', event => {
            const raknetPacket = event.getPacket();
            const inetAddr = event.getInetAddr();

            let token = `${inetAddr.address}:${inetAddr.port}`;
            if (!this.players.has(token))
                return;
            let player = this.players.get(token);

            // TODO: log incoming and outcoming buffers (maybe an option in config)
            // packet dump format example: https://www.npmjs.com/package/hexdump-nodejs

            // Read batch content and handle them
            let pk = new BatchPacket(this);
            (pk as any).buffer = raknetPacket.buffer;

            try {
                pk.decode();
            } catch {
                this.logger.error(`Error while decoding batch`);
                return;
            }

            // Read all packets inside batch and handle them
            for (let buf of pk.getPackets()) {

                if (!this.packetRegistry.getPackets().has(buf[0])) {
                    this.logger.error(`Packet ${raknetPacket.id} doesn't have a handler`);
                    return;
                }

                let packet = new (this.packetRegistry.getPackets().get(buf[0]))();  // Get packet from registry
                packet.buffer = buf;

                try {
                    packet.decode();
                } catch (err) {
                    this.logger.error(`Error while decoding packet: ${packet.constructor.name}: ${err}`);
                    return;
                }

                if (!this.packetRegistry.getHandlers().has(packet.id)) {
                    this.logger.error(`Packet ${packet.constructor.name} doesn't have a handler`);
                    return;
                }

                let handler = this.packetRegistry.getHandlers().get(packet.id);

                (async () => {

                    try {
                        await handler.handle(packet, this, player);
                    } catch (err) {
                        this.logger.error(`Handler error ${packet.constructor.name}-handler: (${err})`);
                    }

                })();

            }


        });

        // Tick worlds every 1/20 of a second (a minecraft tick)
        let tpsTimer = Date.now();
        setIntervalAsync(async () => {
            Promise.all(this.getWorldManager().getWorlds().map(world => world.update(tpsTimer)));

            // Calculate current tps
            this.tps = Math.round((1000 / (Date.now() - tpsTimer)) * 100) / 100;
            tpsTimer = Date.now();
        }, 1000 / 20);

        // Auto save (default: 5 minutes)
        // TODO: level.ticks % 6000 == 0 and save
        setInterval(async () => {
            for (let world of this.getWorldManager().getWorlds()) {
                await world.save();
            }
        }, 1000 * 60 * 5);
    }

    /**
     * Returns an array containing all online players.
     */
    getOnlinePlayers() {
        return Array.from(this.players.values()) || [];
    }

    /**
     * Returns an online player by its runtime ID,
     * if it is not found, null is returned.
     */
    getPlayerById(id: number): Player | null {
        for (let player of this.players.values()) {
            if (player.runtimeId === id) return player;
        }

        return null;
    }

    /**
     * Returns an online player by its name,
     * if it is not found, null is returned.
     * 
     * CASE INSENSITIVE.
     */
    getPlayerByName(name: string): Player | null {
        for (let player of this.players.values()) {
            if (player.name.toLowerCase().startsWith(name.toLowerCase()) ||
                player.name.toLowerCase() === name.toLowerCase()) return player;
        }

        return null;
    }

    /**
     * Returns an online player by its name,
     * if it is not found, null is returned.
     * 
     * CASE SENSITIVE.
     */
    getPlayerByExactName(name: string): Player | null {
        for (let player of this.players.values()) {
            if (player.name === name) return player;
        }

        return null;
    }

    /**
     * Kills the server asynchronously.
     */
    async kill() {
        // Kick all online players
        for (let player of this.getOnlinePlayers()) {
            player.kick('Server closed.');
        }

        // Save all worlds
        for (let world of this.getWorldManager().getWorlds()) {
            await world.save();
        }

        await this.worldManager.onExit();
        await this.onExit();
        process.exit(0);
    }

    /**
     * Returns the query manager
     */
    getQueryManager(): QueryManager | null {
        return this.queryManager;
    };

    /**
     * Returns the command manager
     */
    getCommandManager(): CommandManager {
        return this.commandManager;
    }

    /**
     * Returns the world manager
     */
    getWorldManager(): WorldManager {
        return this.worldManager;
    }

    /**
     * Returns the item manager
     */
    getItemManager(): ItemManager {
        return this.itemManager;
    }

    /**
     * Returns the block manager
     */
    getBlockManager(): BlockManager {
        return this.blockManager;
    }

    /**
     * Returns the logger
     */
    getLogger(): LoggerBuilder {
        return this.logger;
    }

    /**
     * Returns the packet registry
     */
    getPacketRegistry() {
        return this.packetRegistry;
    }

    /**
     * Returns the raknet instance
     */
    getRaknet() {
        return this.raknet;
    }

    /**
     * Returns the plugin manager
     */
    getPluginManager(): PluginManager {
        return this.pluginManager;
    }

    /**
     * Returns the event manager
     */
    getEventManager(): EventManager {
        return this.eventManager;
    }

    /**
     * Returns the config
     */
    getConfig(): Config {
        return this.config;
    }

    /**
     * Returns this Prismarine instance
     */
    getServer() {
        return this;
    }

    /**
     * Returns the current TPS
     */
    getTPS() {
        return this.tps;
    }
}
