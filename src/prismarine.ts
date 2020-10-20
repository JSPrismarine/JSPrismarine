import PacketRegistry from "./network/packet-registry";
import Player from "./player";
import BlockManager from "./block/BlockManager";
import ItemManager from "./item/ItemManager";
import CommandManager from "./command/CommandManager";
import Config from "./config";
import WorldManager from "./world/world-manager";
import QueryManager from "./query/QueryManager";
import PluginManager from "./plugin/PluginManager";
import LoggerBuilder from "./utils/Logger";
import TelemetryManager from "./telemetry/TelemeteryManager";

const Listener = require('@jsprismarine/raknet');
const BatchPacket = require('./network/packet/batch');
const Identifiers = require('./network/identifiers');

interface PrismarineData {
    logger: any,
    config: any
};

export default class Prismarine {
    private raknet: any;
    private logger: LoggerBuilder;
    private config: Config;

    private players: Map<string, Player> = new Map();
    private telemetryManager: TelemetryManager;
    private packetRegistry: PacketRegistry;
    private pluginManager: PluginManager;
    private commandManager: CommandManager;
    private worldManager: WorldManager;
    private itemManager: ItemManager;
    private blockManager: BlockManager;
    private queryManager: QueryManager;

    static instance: null | Prismarine = null;

    constructor({ logger, config }: PrismarineData) {
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
        await this.worldManager.onStart();
        
        // TODO: rework managers to this format
    }
    private async onExit() {
        await this.worldManager.onExit();
        await this.telemetryManager.onExit();
        await this.pluginManager.onExit();
        await this.commandManager.onExit();
        await this.blockManager.onExit();
        await this.itemManager.onExit();
        
        // TODO: rework managers to this format
    }

    public async reload() {
        this.packetRegistry = new PacketRegistry(this);
        this.itemManager = new ItemManager(this);
        this.blockManager = new BlockManager(this);
        this.commandManager = new CommandManager(this);
        
        await this.onExit();
        await this.onStart();
    }

    public async listen(serverIp = '0.0.0.0', port = 19132) {
        await this.onStart();
        
        this.raknet = await (new Listener).listen(serverIp, port);
        this.raknet.name.setOnlinePlayerCount(this.players.size);
        this.raknet.name.setProtocol(Identifiers.Protocol);
        this.raknet.name.setVersion(Identifiers.MinecraftVersion);
        this.raknet.name.setMaxPlayerCount(this.config.getMaxPlayers());
        this.raknet.name.setMotd(this.config.getMotd());

        this.logger.info(`JSPrismarine is now listening on port §b${port}`);

        // Client connected, instantiate player
        this.raknet.on('openConnection', (connection: any) => {
            return new Promise(async (resolve, reject) => {
                let inetAddr = connection.address;

                // TODO: Get last world by player data
                // and if it doesn't exists, return the default one
                let timing = await new Promise((resolve, reject) => {
                    let time = Date.now();
                    let world = this.getWorldManager().getDefaultWorld();
                    if (!world) return reject();  // Temp solution
                    let player = new Player(
                        connection, connection.address, world, this
                    );
                    this.players.set(`${inetAddr.address}:${inetAddr.port}`, player);

                    if (!world)
                        reject();

                    // Add the player into the world
                    world?.addPlayer(player);
                    this.raknet.name.setOnlinePlayerCount(this.players.size);
                    resolve(Date.now() - time);
                });

                this.logger.silly(`Player creation took about ${timing} ms`);
                resolve();
            })
        });

        // Get player from map by address, then handle packet
        this.raknet.on('encapsulated', (packet: any, inetAddr: any) => {
            let token = `${inetAddr.address}:${inetAddr.port}`;
            if (!this.players.has(token))
                return;
            let player = this.players.get(token);

            // TODO: simplify promise code and add an option to 
            // log incoming and outcoming buffers (maybe an option in config)
            // packet dump format example: https://www.npmjs.com/package/hexdump-nodejs
            return new Promise(async (resolve, reject) => {
                // Read batch content and handle them
                let pk = new BatchPacket();
                pk.buffer = packet.buffer;

                try {
                    pk.decode();
                } catch {
                    return reject(`Error while decoding batch`);
                }

                const handlers = [];
                // Read all packets inside batch and handle them
                for (let buf of pk.getPackets()) {
                    if (this.packetRegistry.getPackets().has(buf[0])) {
                        let packet = new (this.packetRegistry.getPackets().get(buf[0]))();  // Get packet from registry
                        packet.buffer = buf;

                        try {
                            packet.decode();

                            // Check if the handler exists
                            if (this.packetRegistry.getHandlers().has(packet.id)) {
                                let handler = this.packetRegistry.getHandlers().get(packet.id);
                                handlers.push(new Promise(async (resolve, reject) => {
                                    try {
                                        await handler.handle(packet, this, player);
                                        return resolve();
                                    } catch (err) {
                                        return reject(`Handler error ${packet.constructor.name}-handler: (${err})`);
                                    }
                                }));
                            } else {
                                return reject(`Packet ${packet.constructor.name} doesn't have a handler`);
                            }
                        } catch (err) {
                            return reject(`Error while decoding packet: ${packet.constructor.name}: ${err}`);
                        }

                    } else {
                        return reject(`Packet ${packet.id} doesn't have a handler`);
                    }
                }

                try {
                    await Promise.all(handlers);
                    return resolve();
                } catch (err) {
                    return reject(err);
                }
            }).catch(err => this.logger.error(err));
        });

        this.raknet.on('closeConnection', (inetAddr: any, reason: string) => {
            return new Promise(async (resolve, reject) => {
                let timing = await new Promise((resolve, reject) => {
                    let time = Date.now();
                    let token = `${inetAddr.address}:${inetAddr.port}`;
                    if (this.players.has(token)) {
                        let player = this.players.get(token);
                        if (!player) return reject(this.logger.error(`Could not find player: ${token}`));

                        // Despawn the player to all online players
                        player.removeFromPlayerList();
                        this.players.delete(token);
                        for (let onlinePlayer of this.players.values()) {
                            player.sendDespawn(onlinePlayer);
                        }
                        player.getWorld().removePlayer(player);

                    }
                    this.logger.info(`${inetAddr.address}:${inetAddr.port} disconnected due to ${reason}`);
                    this.raknet.name.setOnlinePlayerCount(this.players.size);
                    resolve(Date.now() - time);
                });

                this.logger.silly(`Player destruction took about ${timing} ms`);
                resolve();
            });
        });

        // Tick worlds every 1/20 of a second (a minecraft tick)
        setInterval(async () => {
            for (let world of this.getWorldManager().getWorlds()) {
                await world.update(Date.now());
            }
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
     * WARNING: This is currently stubbed
     */
    getTPS() {
        // TODO: get actual TPS after completing the network rework
        return 20;
    }
}
