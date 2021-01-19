import PacketBinaryStream from '../PacketBinaryStream';

const PID_MASK = 0x3ff;
const SENDER_SHIFT = 10;
const RECEIVER_SHIFT = 12;
const SUBCLIENT_MASK = 0x03;
export default class DataPacket extends PacketBinaryStream {
    public static NetID: number;

    private encoded = false;

    // Split screen
    private senderSubId = 0;
    private receiverSubId = 0;

    public getId() {
        return (this.constructor as any).NetID;
    }

    public getEncoded() {
        return this.encoded;
    }

    public getName() {
        return this.constructor.name;
    }

    public decode() {
        this.setOffset(0);
        this.decodeHeader();
        this.decodePayload();

        // Mark all the packets sent by the client
        // as encoded, because they have all the properties
        // and a buffer (like a manually encoded packet).
        this.encoded = true;
    }

    public decodeHeader() {
        const header = this.readUnsignedVarInt();
        const pid = header & PID_MASK;
        if (pid !== this.getId()) {
            throw new Error(`Packet ID must be ${this.getId()}, got ${pid}`);
        }

        this.senderSubId = (header >> SENDER_SHIFT) & SUBCLIENT_MASK;
        this.receiverSubId = (header >> RECEIVER_SHIFT) & SUBCLIENT_MASK;
    }

    public decodePayload() {}

    public encode() {
        this.reset();
        this.encodeHeader();
        this.encodePayload();
        this.encoded = true;
    }

    public encodeHeader() {
        this.writeUnsignedVarInt(
            this.getId() |
                (this.senderSubId << SENDER_SHIFT) |
                (this.receiverSubId << RECEIVER_SHIFT)
        );
    }

    public encodePayload() {}

    public getAllowBatching() {
        return (this as any).allowBatching;
    }
}
