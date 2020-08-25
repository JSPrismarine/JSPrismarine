const BinaryStream = require("jsbinaryutils")

'use strict'

class UUID {

    /** @type {number} */
    #parts
    /** @type {number} */
    #version

    constructor(part1 = 0, part2 = 0, part3 = 0, part4 = 0, version = null)  {
        this.#parts = [part1, part2, part3, part4]
        this.#version = version || (this.#parts[1] & 0xf000) >> 12
    }

    get parts() {
        return this.#parts
    }

    get version() {
        return this.#version
    }

    /**
     * @param {UUID} uuid 
     */
    equals(uuid) {
        return this.#parts === uuid.parts
    }

    /**
     * Creates an UUID from a string hex representation
     * @param {string} uuid 
     * @param {number} version 
     */
    static fromString(uuid, version = null) {
        return UUID.fromBinary(Buffer.from(uuid.trim().replace(/-/g, ""), "hex"), version)
    }

    /**
     * Creates an UUID from a binary representation
     * @param {Buffer} uuid 
     * @param {number} version 
     */
    static fromBinary(uuid, version = null) {
        if (Buffer.byteLength(uuid) !== 16) {
            throw new Error('UUID must have 16 bytes')
        }

        let stream = new BinaryStream()
        stream.buffer = uuid
        return new UUID(stream.readInt(), stream.readInt(), stream.readInt(), stream.readInt(), version)
    }

    /**
     * Generates a random UUIDv4 (string)
     */
    static randomString(){
        let dt = new Date().getTime()
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            let r = (dt + Math.random() * 16) % 16 | 0
            dt = Math.floor(dt / 16)
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
        })
    }
    
    /**
     * Generates a random UUIDv4
     */
    static fromRandom() {
        let strUUID = this.stringFromRandom()
        return UUID.fromString(strUUID, 3)
    }

    toBinary() {
        let stream = new BinaryStream()
        stream.writeInt(this.parts[0])
        stream.writeInt(this.parts[1])
        stream.writeInt(this.parts[2])
        stream.writeInt(this.parts[3])
        return stream.buffer
    }

    toString() {
        let hex = this.toBinary().toString('hex')

        //xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx 8-4-4-4-12
        let parts = []
        parts.push(hex.slice(0, 8))
        parts.push(hex.slice(8, 8+4))
        parts.push(hex.slice(12, 12+4))
        parts.push(hex.slice(16, 16+4))
        parts.push(hex.slice(20, 20+12))
        return parts.join('-')
    }

}
module.exports = UUID