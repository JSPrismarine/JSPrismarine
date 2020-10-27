const BinaryStream = require('@jsprismarine/jsbinaryutils').default;
const InetAddress = require('../utils/InetAddress').default;

'use strict';

// Basic class template
class Packet extends BinaryStream {

    /** @type {number} */
    id
    
    constructor( id ) {
        super();
        this.id = id;
    }

    static get id() {
        return this.id;
    }

    // Decodes packet buffer
    read() {
        this.readByte();  // Skip the packet ID
    }

    // Encodes packet buffer
    write() {
        this.writeByte(this.id);
    }

    // Reads a string from the buffer
    readString() {
        this.read(this.readShort());
    }

    // Writes a string length + buffer 
    // valid only for offline packets
    writeString(v) {
        this.writeShort(Buffer.byteLength(v));
        this.append(Buffer.from(v, 'utf-8'));
    }

    // Reads a RakNet address passed into the buffer 
    readAddress() {
        let ver = this.readByte();
        if (ver == 4) {
            // Read 4 bytes 
            let ipBytes = this.buffer.slice(this.offset, this.addOffset(4, true));
            let addr = `${(-ipBytes[0]-1)&0xff}.${(-ipBytes[1]-1)&0xff}.${(-ipBytes[2]-1)&0xff}.${(-ipBytes[3]-1)&0xff}`;
            let port = this.readShort();
            return new InetAddress(addr, port, ver);
        } else {
            this.offset += 2; // Skip 2 bytes
            let port = this.readShort();
            this.offset += 4; // Skip 4 bytes
            let addr = this.buffer.slice(this.offset, this.offset += 16);
            this.offset += 4;  // Skip 4 bytes
            return new InetAddress(addr, port, ver);
        }
    }
    
    // Writes an IPv4 address into the buffer
    // Needs to get refactored, also needs to be added support for IPv6
    writeAddress(address) {
        this.writeByte(address.version || 4);
        address.address.split('.', 4).forEach(b => this.writeByte(-b-1));
        this.writeShort(address.port);
    }

}
module.exports = Packet;
