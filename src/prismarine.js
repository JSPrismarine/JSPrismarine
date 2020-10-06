const winston = require('winston')

const Listener = require('@jsprismarine/raknet')
const Player = require('./player')
const BatchPacket = require('./network/packet/batch')
const PacketRegistry = require('./network/packet-registry')
const CommandManager = require('./command/command-manager')
const bufferToConsoleString = require("./utils/buffer-to-console-string")
const Identifiers = require('./network/identifiers')
const WorldManager = require('./world/world-manager')
const PluginManager = require('./plugin/plugin-manager')
const Config = require('./utils/config')
const logger = require('./utils/logger')

'use strict'

class Prismarine {

    /** @type {Listener} */
    #raknet
    /** @type {winston.Logger} */ 
    #logger
    /** @type {Config} */
    #config 
    /** @type {Map<string, Player>} */
    #players = new Map()
    /** @type {PacketRegistry} */
    #packetRegistry = new PacketRegistry()
    /** @type {PluginManager} */
    #pluginManager = new PluginManager(this)
    /** @type {CommandManager} */   
    #commandManager = new CommandManager()
    /** @type {WorldManager} */
    #worldManager = new WorldManager(this)
    
    /** @type {null|Prismarine} */
    static instance = null

    constructor({logger, config}) {
        // Pass default server logger and config
        this.#logger = logger
        this.#config = config
        Prismarine.instance = this
    }

    async listen(port = 19132) {
        this.#raknet = await (new Listener).listen('0.0.0.0', port)
        this.#raknet.name.setOnlinePlayerCount(this.#players.size)
        this.#raknet.name.setVersion(Identifiers.Protocol)
        this.#raknet.name.setProtocol(Identifiers.MinecraftVersion)

        this.#logger.info(`JSPrismarine is now listening port §b${port}`)

        // Client connected, instantiate player
        this.#raknet.on('openConnection', (connection) => {
            let inetAddr = connection.address
            // TODO: Get last world by player data
            // and if it doesn't exists, return the default one
            let world = this.getWorldManager().getDefaultWorld()
            let player = new Player(
                connection, connection.address, world, this
            )
            this.#players.set(`${inetAddr.address}:${inetAddr.port}`, player)

            // Add the player into the world
            world.addPlayer(player)
        })

        // Get player from map by address, then handle packet
        this.#raknet.on('encapsulated', async (packet, inetAddr) => {
            let token = `${inetAddr.address}:${inetAddr.port}`
            if (!this.#players.has(token)) return
            let player = this.#players.get(token)

            // TODO: simplify promise code and add an option to 
            // log incoming and outcoming buffers (maybe an option in config)
            // packet dump format example: https://www.npmjs.com/package/hexdump-nodejs
            await new Promise((resolve, reject) => {
                // Read batch content and handle them
                let pk = new BatchPacket()
                pk.buffer = packet.buffer

                try {
                    pk.decode()
                } catch {
                    return reject(`Error while decoding batch`)
                }
                
                // Read all packets inside batch and handle them
                for (let buf of pk.getPackets()) {
                    if (this.#packetRegistry.packets.has(buf[0])) {
                        let packet = new (this.#packetRegistry.packets.get(buf[0]))()  // Get packet from registry
                        packet.buffer = buf
                        
                        try {
                            packet.decode()

                            // Check if the handler exists
                            if (this.#packetRegistry.handlers.has(packet.id)) {
                                let handler = this.#packetRegistry.handlers.get(packet.id)
                                handler.handle(packet, this, player)
                            } else {
                                return reject(`Packet ${packet.constructor.name} doesn't have a handler`)
                            }
                        } catch (err) {
                            return reject(`Error while decoding packet: ${packet.constructor.name}`)
                        }

                    } else {
                        return reject('Packet doesn\'t have a handler')
                    }
                }

                return resolve()
            }).catch(err => this.#logger.error(err))
        })

        this.#raknet.on('closeConnection', (inetAddr, reason) => {
            let token = `${inetAddr.address}:${inetAddr.port}`
            if (this.#players.has(token)) {
                let player = this.#players.get(token)

                // Despawn the player to all online players
                player.removeFromPlayerList()
                this.#players.delete(token)
                for (let onlinePlayer of this.#players.values()) {
                    player.sendDespawn(onlinePlayer)
                }
                player.getWorld().removePlayer(player)

            }
            this.#logger.info(`${inetAddr.address}:${inetAddr.port} disconnected due to ${reason}`)
        })

        // Update player count every 5 seconds
        setInterval(() => this.#raknet.name.setOnlinePlayerCount(
            this.#players.size
        ), 1000 * 5)

        // Tick worlds every 1/20 of a second (a minecraft tick)
        setInterval(() => {
            for (let world of this.getWorldManager().getWorlds()) {
                world.update(Date.now())
            }
        }, 1000 / 20)

        // Auto save (default: 5 minutes seconds)
        // TODO: level.ticks % 6000 == 0 and save
        setInterval(async() => {
            for (let world of this.getWorldManager().getWorlds()) {
                await world.save()
            }
        }, 1000 * 60 * 5)
    }

    /**
     * Returns an array containing all online players.
     * 
     * @returns {Player[]}
     */
    getOnlinePlayers() {
        return Array.from(this.#players.values())
    }

    /**
     * Returns an online player by its runtime ID,
     * if it is not found, null is returned.
     * 
     * @param {number} id 
     */
    getPlayerById(id) {
        for (let player of this.#players.values()) {
            if (player.runtimeId === id) return player
        }

        return null
    }

    /**
     * Returns an online player by its name,
     * if it is not found, null is returned.
     * 
     * CASE INSENSITIVE.
     * 
     * @param {String} name 
     */
    getPlayerByName(name) {
        for (let player of this.#players.values()) {
            if (player.name.toLowerCase().startsWith(name.toLowerCase()) || 
                player.name.toLowerCase() === name.toLowerCase()) return player
        }

        return null
    }

    /**
     * Returns an online player by its name,
     * if it is not found, null is returned.
     * 
     * CASE SENSITIVE.
     * 
     * @param {String} name 
     */
    getPlayerByExactName(name) {
        for (let player of this.#players.values()) {
            if (player.name === name) return player
        }

        return null
    }

    /**
     * Kills the server async asynchronously.
     */
    async kill() {
        // Kick all online players
        for (let player of this.getOnlinePlayers()) {
            player.kick('Server closed.')
        }
        
        // Save all worlds
        for (let world of this.getWorldManager().getWorlds()) {
            await world.save()
        }

        setTimeout(() => { process.exit(0) }, 1000)
    }

    getCommandManager() {
        return this.#commandManager
    }

    getWorldManager() {
        return this.#worldManager
    }

    getLogger() {
        return this.#logger
    }

    getPacketRegistry() {
        return this.#packetRegistry
    }

    getRaknet() {
        return this.#raknet
    }

    getPluginManager() {
        return this.#pluginManager
    }

    getServer() {
        return this
    }

}
module.exports = Prismarine
