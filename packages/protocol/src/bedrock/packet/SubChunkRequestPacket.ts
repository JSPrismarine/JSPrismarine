import { subChunkRequestPacket } from '../wire/definitions/subChunkRequest';
import { layoutAt } from '../../wire/WireLayout';

import FieldNetworkPacket from '../../FieldNetworkPacket';

/** Offset of one requested sub chunk from the center, in sub chunks, each an int8. */
export interface SubChunkOffset {
    /** Signed X offset from the center, in sub chunks. */
    x: number;
    /** Signed Y offset from the center, in sub chunks. */
    y: number;
    /** Signed Z offset from the center, in sub chunks. */
    z: number;
}

/** A sub chunk position in sub chunk units, each an int32 LE. */
export interface SubChunkPosition {
    /** X coordinate of the request center. */
    x: number;
    /** Y coordinate of the request center. */
    y: number;
    /** Z coordinate of the request center. */
    z: number;
}

/**
 * A batch of sub chunks the client wants, relative to a center.
 *
 * The wire layout lives in the declarative definition this class walks: Dimension Type as a
 * ZigZag varint32, SubChunk Position Offset List as a varuint32 count of three int8 offsets, then
 * Center Pos as three int32 LE. The offsets come before the center, as both Mojang's page and
 * gophertunnel have it.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/sub-chunk-request-packet/
 */
export default class SubChunkRequestPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'SubChunkRequestPacket';
    }

    /** 0 for the overworld, 1 for the nether, 2 for the end. */
    public dimensionType = 0;

    /** Requested offsets from the center, in packet order. */
    public offsets: SubChunkOffset[] = [];

    /** Center coordinate for the request, encoded as three little-endian int32 values. */
    public centerPos: SubChunkPosition = { x: 0, y: 0, z: 0 };

    /** Writes the dimension, the offsets, and the center. */
    public encodePayload(): void {
        layoutAt(subChunkRequestPacket, this.codecProtocol).encode(this, this);
    }

    /** Reads the dimension, the offsets, and the center. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(subChunkRequestPacket, this.codecProtocol).decode(this));
    }
}
