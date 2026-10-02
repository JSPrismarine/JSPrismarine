import BinaryStream from '@jsprismarine/binaryutils';

const PID_MASK = 0x3ff;
const SENDER_SHIFT = 10;
const RECEIVER_SHIFT = 12;
const SUBCLIENT_MASK = 0x03;

/**
 * The packet id at the front of an encoded packet, without decoding the rest of it.
 *
 * Needed because something has to choose which class to build before there is an instance to
 * ask. The header is an unsigned varint carrying the id in its low ten bits and the two
 * subclient ids above them - not a byte, though it looks like one for every id below 256:
 * there the varint's first byte happens to equal the id. Above that the coincidence ends, and
 * reading the first byte gave 179 for packet 307, which was dispatched to whichever class
 * owned 179 and then failed to decode as itself. `SetPlayerInventoryOptions` is 0x133, which
 * is how switching an inventory tab came to raise an error about ticking areas.
 * @param {Uint8Array} buffer - an encoded packet, positioned at its header.
 * @returns {number} the packet id.
 */
export const readPacketId = (buffer: Uint8Array): number => {
    let value = 0;

    for (let shift = 0; shift < 35; shift += 7) {
        const byte = buffer[shift / 7];
        if (byte === undefined) break; // Truncated; the caller will not find it in the registry.

        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
    }

    return value & PID_MASK;
};

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

    /** Protected so a subclass encoding by another route - `BatchPacket.encodeAsync` - can say so. */
    protected encoded = false;

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
}
