import type Prismarine from "../../Prismarine";
import PacketBinaryStream from "../PacketBinaryStream";

const PID_MASK = 0x3ff;
const SENDER_SHIFT = 10;
const RECEIVER_SHIFT = 12;
const SUBCLIENT_MASK = 0x03;
export default class DataPacket extends PacketBinaryStream {
    static NetID: number;

    #encoded = false

    // Split screen
    #senderSubId = 0
    #receiverSubId = 0

    get id() {
        return (this.constructor as any).NetID;
    }

    getName() {
        return this.constructor.name;
    }

    decode() {
        (this as any).offset = 0;
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

    decodePayload(server?: Prismarine) { }

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

    encodePayload(server?: Prismarine) { }

    get encoded() {
        return this.#encoded;
    }

    get allowBatching() {
        return (this as any)._allowBatching;
    }
};
