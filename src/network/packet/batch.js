const Zlib = require('zlib')

const DataPacket = require("./packet")
const BinaryStream = require('jsbinaryutils')
const PacketBinaryStream = require('../packet-binary-stream')

'use strict'

class BatchPacket extends DataPacket {
    static NetID = 0xfe

    payload = Buffer.alloc(0)
    _compressionLevel

    _allowBatching = false
    _allowBeforeLogin = true

    decodeHeader() {
        let pid = this.readByte()
        if (!pid === this.id) {
            throw new Error(`Batch ID mismatch: is ${this.id}, got ${pid}`)
        }
    }

    decodePayload() {
        let data = this.readRemaining()
        try {
            this.payload = Zlib.inflateRawSync(data, {chunkSize: 1024 * 1024 * 2})
        } catch (e) {
            this.payload = Buffer.alloc(0)
        }
    }

    encodeHeader() {
        this.writeByte(this.id)
    }

    encodePayload() {
        this.append(Zlib.deflateRawSync(this.payload, {level: this._compressionLevel}))
    }

    /**
     * @param {DataPacket} packet 
     */
    addPacket(packet) {
        // if (!packet.allowBatching) {
        //    throw new Error(`${packet.getName()} can't be batched`)
        // }

        if (!packet.encoded) {
            packet.encode()
        }

        let stream = new BinaryStream()
        stream.writeUnsignedVarInt(packet.buffer.length)
        stream.append(packet.buffer)
        this.payload = Buffer.concat([this.payload, stream.buffer])
    }

    getPackets() {
        let stream = new PacketBinaryStream()
        stream.buffer = this.payload
        let packets = []
        while (!stream.feof()) {
            packets.push(stream.read(stream.readUnsignedVarInt()))
        }
        return packets
    }
}
module.exports = BatchPacket