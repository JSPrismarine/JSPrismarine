import type NetworkBinaryStream from './NetworkBinaryStream';

/**
 * Represents the network packet (aka DataPacket).
 * This is just a serialization layer to include the packet header
 * and to reduce redundancy in the packet classes.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/packetHeader.html}
 */
export default abstract class NetworkPacket<T> {
    abstract get id(): number;

    // The actual packet id is represented by the first 10 bits of the packet ID.
    private static PID_MASK = 0x3ff;
    private static SUB_CLIENT_MASK = 0x03;

    // Next 2 bits are the sender sub client ID.
    private static SENDER_SUB_CLIENT_SHIFT = 10;
    // Next 2 bits are the target sub client ID.
    private static TARGET_SUB_CLIENT_SHIFT = 12;

    public senderSubClientId = 0;
    public targetSubClientId = 0;

    /**
     * Constructs a new network packet.
     * @param packetData - The packet data to include in the network packet.
     */
    public constructor(private packetData: T | null = null) {}

    /**
     * Serializes the payload of the network packet into a binary stream.
     * @param stream - The binary stream to serialize into.
     * @param packetData - The packet data to serialize.
     */
    protected abstract serializePayload(stream: NetworkBinaryStream, packetData: T): void;

    /**
     * Serializes the network packet into a binary stream.
     * @param stream - The binary stream to serialize into.
     * @returns The serialized network packet as a Buffer.
     */
    public serialize(stream: NetworkBinaryStream): Buffer {
        if (this.packetData === null) {
            throw new Error(`Cannot serialize packet without data, PID: ${this.id.toString(16)}`);
        }
        stream.writeUnsignedVarInt(
            this.id |
                (this.senderSubClientId << NetworkPacket.SENDER_SUB_CLIENT_SHIFT) |
                (this.targetSubClientId << NetworkPacket.TARGET_SUB_CLIENT_SHIFT)
        );
        this.serializePayload(stream, this.packetData);
        return stream.getBuffer();
    }

    /**
     * Deserializes the payload of the network packet from a binary stream.
     * @param stream - The binary stream to deserialize from.
     */
    protected abstract deserializePayload(stream: NetworkBinaryStream): T;

    /**
     * Deserializes the network packet from a binary stream.
     * @param stream - The binary stream to deserialize from.
     */
    public deserialize(stream: NetworkBinaryStream): T {
        const header = stream.readUnsignedVarInt();
        const pid = header & NetworkPacket.PID_MASK;
        if (pid !== this.id) {
            throw new Error(`NetworkPacket ID mismatch: expected ${this.id}, got ${pid}`);
        }
        this.senderSubClientId = (header >> NetworkPacket.SENDER_SUB_CLIENT_SHIFT) & NetworkPacket.SUB_CLIENT_MASK;
        this.targetSubClientId = (header >> NetworkPacket.TARGET_SUB_CLIENT_SHIFT) & NetworkPacket.SUB_CLIENT_MASK;
        try {
            this.packetData = this.deserializePayload(stream);
        } catch (e: unknown) {
            throw new Error(`Error deserializing packet payload: ${e}`);
        }
        return this.packetData;
    }

    /**
     * Gets the packet data.
     * Probably will be removed in the future.
     * @returns The packet data.
     */
    public getPacketData(): T | null {
        return this.packetData;
    }
}
