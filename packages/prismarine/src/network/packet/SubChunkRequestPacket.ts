import DataPacket from './DataPacket';

/** Offset of one requested sub chunk from the center, in sub chunks, each an int8. */
export interface SubChunkOffset {
    x: number;
    y: number;
    z: number;
}

/** A sub chunk position in sub chunk units, each an int32 LE. */
export interface SubChunkPosition {
    x: number;
    y: number;
    z: number;
}

/**
 * A batch of sub chunks the client wants, relative to a center.
 *
 * Wire layout at protocol 2193: Dimension Type as a ZigZag varint32, SubChunk Position Offset
 * List as a varuint32 count of three int8 offsets, then Center Pos as three int32 LE. The
 * offsets come before the center, as both Mojang's page and gophertunnel have it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.50/packets/sub-chunk-request-packet/
 */
export default class SubChunkRequestPacket extends DataPacket {
    /** 0 for the overworld, 1 for the nether, 2 for the end. */
    public dimensionType = 0;

    public offsets: SubChunkOffset[] = [];
    public centerPos: SubChunkPosition = { x: 0, y: 0, z: 0 };

    /** Reads the dimension, the offsets, and the center. */
    public decodePayload(): void {
        this.dimensionType = this.readVarInt();

        const count = this.readUnsignedVarInt();
        this.offsets = [];
        for (let index = 0; index < count; index++) {
            this.offsets.push({ x: this.readSignedByte(), y: this.readSignedByte(), z: this.readSignedByte() });
        }

        this.centerPos = { x: this.readIntLE(), y: this.readIntLE(), z: this.readIntLE() };
    }

    /** Writes the dimension, the offsets, and the center. */
    public encodePayload(): void {
        this.writeVarInt(this.dimensionType);
        this.writeUnsignedVarInt(this.offsets.length);
        for (const offset of this.offsets) {
            this.writeSignedByte(offset.x);
            this.writeSignedByte(offset.y);
            this.writeSignedByte(offset.z);
        }
        this.writeIntLE(this.centerPos.x);
        this.writeIntLE(this.centerPos.y);
        this.writeIntLE(this.centerPos.z);
    }
}
