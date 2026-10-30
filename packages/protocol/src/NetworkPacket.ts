import BinaryStream from '@jsprismarine/binaryutils';
import NetworkBinaryStream from './NetworkBinaryStream';
import type { ProtocolContext } from './ProtocolContext';
import { netIdFor, protocolVersion } from './wire/versions/v2193';

const PACKET_ID_MASK = 0x3ff;

/**
 * Reads the packet id from a Bedrock packet header without consuming its body.
 *
 * The header is an unsigned varint. Its low ten bits are the packet id; sender and target
 * subclient ids occupy the bits above them. For a truncated varint, the bytes that are present
 * still contribute to the returned id; callers can pass it through their ordinary packet lookup.
 * @param buffer - Encoded packet bytes positioned at the header.
 * @returns The packet id in the low ten bits of the header.
 */
export const readPacketId = (buffer: Uint8Array): number => {
    let value = 0;

    for (let shift = 0; shift < 35; shift += 7) {
        const byte = buffer[shift / 7];
        if (byte === undefined) break;

        value |= (byte & 0x7f) << shift;
        if ((byte & 0x80) === 0) break;
    }

    return value & PACKET_ID_MASK;
};

/**
 * A Bedrock packet with its wire header and packet-specific payload codec.
 *
 * The header is one varuint32: the low 10 bits are the packet id, the next two bits the
 * sender sub-client id, and the next two bits the target sub-client id. The docs have no
 * separate page for the header; each packet page lists it as the `ID` varuint before the
 * body. Typed packet classes supply a payload object and implement both payload directions.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/#packets}
 */
export default abstract class NetworkPacket<T = unknown> extends BinaryStream {
    // The actual packet id is represented by the first 10 bits of the packet ID.
    private static PID_MASK = PACKET_ID_MASK;
    private static SUB_CLIENT_MASK = 0x03;

    // Next 2 bits are the sender sub client ID.
    private static SENDER_SUB_CLIENT_SHIFT = 10;
    // Next 2 bits are the target sub client ID.
    private static TARGET_SUB_CLIENT_SHIFT = 12;

    public senderSubClientId = 0;
    public targetSubClientId = 0;
    /** Version stamped by the connection codec for version-gated payloads. */
    public codecProtocol = protocolVersion;
    protected encoded = false;
    private networkId: number | undefined;

    /**
     * Constructs a new network packet.
     * @param packetData - The packet data to include in the network packet.
     */
    public constructor(
        private packetData: T | null = null,
        buffer?: Buffer
    ) {
        super(buffer);
    }

    /**
     * The class name used by the server's packet handlers and traffic logs.
     * @returns The concrete packet class name.
     */
    public getName(): string {
        return this.constructor.name;
    }

    /**
     * Gets the wire id stamped by a version codec, or the packet class's default id.
     * @returns The packet id for this instance.
     */
    public getId(): number {
        return this.networkId ?? this.getDefaultId();
    }

    /**
     * Stamps the id selected by a negotiated protocol version.
     * @param id - The packet id in that version's table.
     */
    public setNetId(id: number): void {
        this.networkId = id;
    }

    /** @returns Whether this packet already has encoded bytes in its stream. */
    public getEncoded(): boolean {
        return this.encoded;
    }

    /** Encodes the packet into this instance's write buffer for callers that queue packet objects. */
    public encode(context?: ProtocolContext): void {
        const stream = new NetworkBinaryStream();
        this.serialize(stream, context);
        this.reuse(stream.copyOut());
        this.encoded = true;
    }

    /** Decodes a packet from this instance's read buffer. */
    public decode(context?: ProtocolContext): void {
        const buffer = this.getReadBuffer();
        if (buffer === null) throw new Error(`Cannot decode ${this.getName()} without a read buffer`);

        this.deserialize(new NetworkBinaryStream(buffer), context);
        this.reuse(buffer);
        this.encoded = true;
    }

    /** Writes the Bedrock packet header to this instance's write buffer. */
    public encodeHeader(): void {
        this.writeUnsignedVarInt(this.headerValue());
    }

    /** Reads and validates the Bedrock packet header from this instance's read buffer. */
    public decodeHeader(): void {
        this.readHeaderFromSelf();
    }

    /**
     * Serializes the packet body, using server-supplied tables when the payload needs them.
     * @param stream - The stream positioned after the packet header.
     * @param packetData - The typed body to encode.
     * @param context - Versioned registries and captured data for this connection.
     */
    protected abstract serializePayload(stream: NetworkBinaryStream, packetData: T, context?: ProtocolContext): void;

    /** Legacy mutable-field body hook implemented by {@link FieldNetworkPacket}. */
    public encodePayload(): void {}

    /**
     * Serializes the network packet into a binary stream.
     * @param stream - The binary stream to serialize into.
     * @param context - Optional protocol data supplied for the connection.
     * @returns The serialized network packet as a Buffer.
     */
    public serialize(stream: NetworkBinaryStream, context?: ProtocolContext): Buffer {
        if (this.packetData === null)
            throw new Error(`Cannot serialize packet without data, PID: ${this.getId().toString(16)}`);
        if (context !== undefined) this.codecProtocol = context.protocolVersion;
        stream.writeUnsignedVarInt(this.headerValue());
        this.serializePayload(stream, this.packetData, context);
        return stream.getBuffer();
    }

    /**
     * Deserializes the packet body, using server-supplied tables when the payload needs them.
     * @param stream - The stream positioned after the packet header.
     * @param context - Versioned registries and captured data for this connection.
     * @returns The typed packet body.
     */
    protected abstract deserializePayload(stream: NetworkBinaryStream, context?: ProtocolContext): T;

    /** Legacy mutable-field body hook implemented by {@link FieldNetworkPacket}. */
    public decodePayload(): void {}

    /**
     * Deserializes the network packet from a binary stream.
     * @param stream - The stream containing the packet header and body.
     * @param context - Optional protocol data supplied for the connection.
     * @returns The typed packet body.
     */
    public deserialize(stream: NetworkBinaryStream, context?: ProtocolContext): T {
        this.readHeader(stream);
        if (context !== undefined) this.codecProtocol = context.protocolVersion;
        try {
            this.packetData = this.deserializePayload(stream, context);
        } catch (e: unknown) {
            throw new Error(`Error deserializing packet payload: ${e}`);
        }
        return this.packetData;
    }

    /**
     * Returns the packet body object supplied to the constructor or produced by `deserialize`.
     * @returns The typed payload, or `null` before one has been supplied or decoded.
     */
    public getPacketData(): T | null {
        return this.packetData;
    }

    /** Encoded packet ID and split-screen ids, shared by both wire directions. */
    private headerValue(): number {
        return (
            this.getId() |
            (this.senderSubClientId << NetworkPacket.SENDER_SUB_CLIENT_SHIFT) |
            (this.targetSubClientId << NetworkPacket.TARGET_SUB_CLIENT_SHIFT)
        );
    }

    /** Reads the header from an arbitrary stream, as `serialize` and `deserialize` do. */
    private readHeader(stream: NetworkBinaryStream): void {
        const header = stream.readUnsignedVarInt();
        this.applyHeader(header);
    }

    /** Reads the header through this packet's own stream cursor. */
    private readHeaderFromSelf(): void {
        this.applyHeader(this.readUnsignedVarInt());
    }

    /** Validates and unpacks a header value. */
    private applyHeader(header: number): void {
        const pid = header & NetworkPacket.PID_MASK;
        const expected = this.getId();
        if (pid !== expected) throw new Error(`NetworkPacket ID mismatch: expected ${expected}, got ${pid}`);

        this.senderSubClientId = (header >> NetworkPacket.SENDER_SUB_CLIENT_SHIFT) & NetworkPacket.SUB_CLIENT_MASK;
        this.targetSubClientId = (header >> NetworkPacket.TARGET_SUB_CLIENT_SHIFT) & NetworkPacket.SUB_CLIENT_MASK;
    }

    /** Default id supplied by a typed packet class or by the version's packet table. */
    protected getDefaultId(): number {
        const tableId = netIdFor(this.getName());
        if (tableId !== undefined) return tableId;

        const id: unknown = Reflect.get(this, 'id');
        if (typeof id !== 'number') throw new Error(`Packet ${this.getName()} has no default network id`);
        return id;
    }
}
