import BinaryStream from '@jsprismarine/jsbinaryutils';

const PID_MASK = 0x3ff;
const SENDER_SHIFT = 10;
const RECEIVER_SHIFT = 12;
const SUBCLIENT_MASK = 0x03;

/**
 * The base class for all packets.
 * @class
 * @public
 */
export default class DataPacket extends BinaryStream {
    /**
     * The packet's network ID.
     */
    public static NetID: number;

    private encoded = false;

    // Split screen
    private senderSubId = 0;
    private receiverSubId = 0;

    constructor(buffer?: Buffer) {
        super(buffer, 0);
    }

    public getBuffer(): Buffer {
        return super.getBuffer();
    }

    public getId(): number {
        return (this.constructor as any).NetID;
    }

    public getEncoded(): boolean {
        return this.encoded;
    }

    /**
     * Get the DataPacket's name.
     *
     * @returns The packet's name
     */
    public getName(): string {
        return this.constructor.name;
    }

    public decode(): void {
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

    /**
     * Decode the packet from a network serialized buffer.
     */
    public decodePayload(): void {}

    public encode(): void {
        this.clear(); // We might not want to actually clear the buffer here.
        this.encodeHeader();
        this.encodePayload();
        this.encoded = true;
    }

    public encodeHeader(): void {
        this.writeUnsignedVarInt(
            this.getId() | (this.senderSubId << SENDER_SHIFT) | (this.receiverSubId << RECEIVER_SHIFT)
        );
    }

    /**
     * Encode the packet to a network serialized buffer.
     */
    public encodePayload(): void {}

    public getAllowBatching(): boolean {
        return (this as any).allowBatching;
    }
}
