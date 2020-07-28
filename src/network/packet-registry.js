const fs = require('fs')
const path = require('path')
const util = require('util')
const logger = require('../utils/logger')

const DataPacket = require('./packet/packet')

'use strict'

class PacketRegistry {
    #packets = new Map()
    #handlers = new Map()

    constructor() {
        this.loadPackets()
        this.loadHandlers()
    }

    /**
     * @param {DataPacket} packet 
     */
    registerPacket(packet) {
        this.#packets.set(packet.NetID, packet)
    }

    registerHandler(handler) {
        this.#handlers.set(handler.NetID, handler)
    }

    loadPackets() {
        let dir = path.join(__dirname + '/packet')
        fs.readdir(dir, (err, files) => {
            if (err) logger.error(`Cannot load packets: ${err}`)
            for (let i = 0; i < files.length; i++) {
                let packet = require(path.join(dir, files[i]))
                this.registerPacket(packet)
            }
            logger.debug(`Loaded ${this.packets.size} Minecraft packets!`)
        })
    }

    loadHandlers() {
        let dir = path.join(__dirname + '/handler')
        fs.readdir(dir, (err, files) => {
            if (err) logger.error(`Cannot load packets: ${err}`)
            for (let i = 0; i < files.length; i++) {
                let packet = require(path.join(dir, files[i]))
                this.registerHandler(packet)
            }
            logger.debug(`Loaded ${this.handlers.size} packet handlers!`)
        })
    }

    get packets() {
        return this.#packets
    }

    get handlers() {
        return this.#handlers
    }
 
}
module.exports = PacketRegistry