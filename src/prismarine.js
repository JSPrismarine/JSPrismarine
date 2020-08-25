const winston = require('winston')
const async = require('async')
const path = require('path')

const Listener = require('jsraknet')
const Player = require('./player')
const BatchPacket = require('./network/packet/batch')
const PacketRegistry = require('./network/packet-registry')
const Level = require('./level/level')
const LevelDB = require('./level/leveldb/leveldb')

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
    /** @type {Level|null} */
    #defaultLevel = null
    /** @type {Map<String, Level>} */
    #levels = new Map()
    /** @type {Map<String, Object>} */
    #plugins = new Map()
    /** @type {null|Prismarine} */
    static instance = null

    constructor(logger) {
        // Pass default server logger
        this.#logger = logger
        Prismarine.instance = this
    }

    listen() {
        this.#raknet = (new Listener).listen('0.0.0.0', 19132)

        // Client connected, instantiate player
        this.#raknet.on('openConnection', (connection) => {
            let inetAddr = connection.address
            this.#players.set(`${inetAddr.address}:${inetAddr.port}`, new Player(
                connection, connection.address, this.#logger, this
            ))
        })

        // Get player from map by address, then handle packet
        this.#raknet.on('encapsulated', (packet, inetAddr) => {
            let token = `${inetAddr.address}:${inetAddr.port}`
            if (!this.#players.has(token)) return
            let player = this.#players.get(token)

            async.waterfall([
                function(callback) {
                    // Read batch content and handle them
                    let pk = new BatchPacket()
                    pk.buffer = packet.buffer
                    pk.decode()
                    return callback(null, pk)
                }, function(pk, callback) {
                    // Read all packets inside batch and handle them
                    for (let buf of pk.getPackets()) {
                        if (this.#packetRegistry.packets.has(buf[0])) {
                            // Get packet from registry
                            let packet = new (this.#packetRegistry.packets.get(buf[0]))()  
                            packet.buffer = buf
                            packet.decode()
                            return callback(null, packet)
                        } else {
                            // The new logger won't work
                            console.log('Unhandled packet', buf)  
                        }
                    }
                }.bind(this)
            ], function(err, packet) {
                if (err) this.#logger.console.error(err)
                if (this.#packetRegistry.handlers.has(packet.id)) {
                    let handler = this.#packetRegistry.handlers.get(packet.id)
                    handler.handle(packet, player)
                } else {
                    this.#logger.debug(`Unhandled packet: ${packet.id}`)
                }
            }.bind(this))
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

                this.#players.delete(token)
            }
            this.#logger.info(`${inetAddr.address}:${inetAddr.port} disconnected due to ${reason}`)
        })

        // Load default level (this is just a test)
        if (this.#defaultLevel === null) {
            this.#defaultLevel = new Level(this, "LevelName", undefined)
        }

        // this.loadLevel('world')
    }

    // TODO: it is now used just to test 
    // a random default level
    loadLevel(folderName) {
        // TODO: check if it's already loaded
        let levelPath = __dirname + `/../worlds/${folderName}/`
        let provider = new LevelDB(levelPath)
        let level = new Level(this, folderName, provider)
        this.#levels.set(level.uniqueId, level)
    } 

    /**
     * Loads a plugin form a given file even in runtime.
     * 
     * @param {string} file 
     */
    loadPlugin(file) {
        let plugin = require(path.resolve(file))
        let manifest = plugin.manifest
        let name = file.replace('.js', '').replace('./plugins/', '')
        // if manifest is not defined in the plugin
        // just warn the user :), it's just unstable
        if (typeof manifest === "undefined") {
            this.#logger.warn(
                `PLugin ${name} doesn't have a manifest so i can't check the target API version`
            )
        } else {
            // TODO: all other manifest cheks
            // if manifest has plugin name use them
        } 
        plugin.server = this 
        this.#plugins.set(name, plugin)
        this.#logger.info(`Plugin ${name} loaded!`)
    }

    get defaultLevel() {
        return this.#defaultLevel
    }

    get players() {
        return this.#players
    }

}
module.exports = Prismarine
