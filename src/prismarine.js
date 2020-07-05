const winston = require('winston')

const Listener = require('jsraknet')
const Player = require('./player')
const BatchPacket = require('./protocol/mcbe/batch_packet')
const PacketRegistry = require('./protocol/packet_registry')

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

    constructor(logger) {
        // Pass default server logger
        this.#logger = logger
    }

    listen() {
        this.#raknet = (new Listener).listen('0.0.0.0', 19132)

        // Client connected, instantiate player
        this.#raknet.on('openConnection', (connection) => {
            this.#players.set(connection.address.address, new Player(
                connection, connection.address, this.#logger, this
            ))
        })

        // Get player from map by address, then handle packet
        this.#raknet.on('encapsulated', (packet, inetAddr) => {
            if (!this.#players.has(inetAddr.address)) return
            let player = this.#players.get(inetAddr.address)

            // Read batch content and handle them
            let pk = new BatchPacket()
            pk.buffer = packet.buffer
            pk.decode()

            // Read all packets inside batch and handle them
            for (let buf of pk.getPackets()) {
                if (this.#packetRegistry.has(buf[0])) {
                    let packet = new (this.#packetRegistry.get(buf[0]))()  // Get packet from registry
                    packet.buffer = buf
                    packet.decode()
                    player.handleDataPacket(packet)
                } else {
                    console.log('Unhandled packet', buf)  // The new logger won't work
                }
            }
        })

        this.#raknet.on('closeConnection', (inetAddress, reason) => {
            this.#logger.info(`${inetAddress.address}:${inetAddress.port} disconnected due to ${reason}`)
        })
    }

    get players() {
        return this.#players
    }

}
module.exports = Prismarine
