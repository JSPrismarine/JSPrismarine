const winston = require('winston')

const Listener = require('jsraknet')
const Player = require('./player')
const BatchPacket = require('./network/packet/batch')
const PacketRegistry = require('./network/packet-registry')
const CommandManager = require('./command/command-manager')
const bufferToConsoleString = require("./utils/buffer-to-console-string")
const Identifiers = require('./network/identifiers')
const WorldManager = require('./world/world-manager')
const PluginManager = require('./plugin/plugin-manager')

'use strict'

class Prismarine {

    /** @type {Listener} */
    #raknet
    /** @type {winston.Logger} */ 
    #logger
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

    constructor(logger) {
        // Pass default server logger
        this.#logger = logger
        Prismarine.instance = this
    }

    async listen(port = 19132) {
        this.#raknet = await (new Listener).listen('0.0.0.0', port)
        this.#raknet.name.setOnlinePlayerCount(this.#players.entries.length)
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
        this.#raknet.on('encapsulated', (packet, inetAddr) => {
            let token = `${inetAddr.address}:${inetAddr.port}`
            if (!this.#players.has(token)) return
            let player = this.#players.get(token)

            // Read batch content and handle them
            let pk = new BatchPacket()
            pk.buffer = packet.buffer
            pk.decode()
            
            // Read all packets inside batch and handle them
            for (let buf of pk.getPackets()) {
                if (this.#packetRegistry.packets.has(buf[0])) {
                    let packet = new (this.#packetRegistry.packets.get(buf[0]))()  // Get packet from registry
                    packet.buffer = buf
                    packet.decode()

                    // Check if the handler exists
                    if (this.#packetRegistry.handlers.has(packet.id)) {
                        let handler = this.#packetRegistry.handlers.get(packet.id)
                        handler.handle(packet, this, player)
                    } else {
                        this.#logger.debug(`Unhandled packet: §b${packet.constructor.name}`)
                    }
                } else {
                    this.#logger.debug("Unhandled packet: " + bufferToConsoleString(buf))
                }
            }
        })

        this.#raknet.on('closeConnection', (inetAddr, reason) => {
            let token = `${inetAddr.address}:${inetAddr.port}`
            if (this.#players.has(token)) {
                let player = this.#players.get(token)

                // Despawn the player to all online players
                player.removeFromPlayerList()
                for (const [_, onlinePlayer] of this.#players) {
                    if (onlinePlayer === player) continue
                    player.sendDespawn(onlinePlayer)
                }
                player.getWorld().removePlayer(player)

                this.#players.delete(token)
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

        setInterval(() => {
            for (let world of this.getWorldManager().getWorlds()) {
                world.save()
            }
        }, 1000 * 5)
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

    getLogger() {
        return this.#logger
    }

    getRaknet() {
        return this.#raknet
    }

    getServer() {
        return this
    }

}
module.exports = Prismarine
