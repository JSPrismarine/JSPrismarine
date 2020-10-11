const PacketBinaryStream = require('../packet-binary-stream');


const PID_MASK = 0x3ff;
const SENDER_SHIFT = 10;
const RECEIVER_SHIFT = 12;
const SUBCLIENT_MASK = 0x03;
class DataPacket extends PacketBinaryStream {

    static NetID 

    #encoded = false

    // Split screen
    #senderSubId = 0
    #receiverSubId = 0

    get id() {
        return this.constructor.NetID;
    }

    getName() {
        return this.constructor.name;
    }

    decode() {
        this.offset = 0;
        this.decodeHeader();
        this.decodePayload();
        // Mark all the packets sent by the client
        // as encoded, because they have all the properties
        // and a buffer (like a manually encoded packet). 
        this.#encoded = true;  
    }

    decodeHeader() {
        let header = this.readUnsignedVarInt();
        let pid = header & PID_MASK;
        if (pid !== this.id) {
            throw new Error(`Packet ID must be ${this.id}, got ${pid}`);
        }
        this.#senderSubId = (header >> SENDER_SHIFT) & SUBCLIENT_MASK;
        this.#receiverSubId = (header >> RECEIVER_SHIFT) & SUBCLIENT_MASK;
    }

    decodePayload() {

    }

    encode() {
        this.reset();
        this.encodeHeader();
        this.encodePayload();
        this.#encoded = true;
    }

    encodeHeader() {
        this.writeUnsignedVarInt(
            this.id |
            (this.#senderSubId << SENDER_SHIFT) |
            (this.#receiverSubId << RECEIVER_SHIFT)
        );
    }

    encodePayload() {

    }

    get encoded() {
        return this.#encoded;
    }

    get allowBatching() {
        return this._allowBatching;
    }
}
module.exports = DataPacket;
