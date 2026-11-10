import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { requestChunkRadiusPacket } from '../wire/definitions/chunkRadiusUpdated';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The client's requested view distance and the largest distance it can accept. */
export interface RequestChunkRadius {
    /** The docs' Chunk Radius: how far the client would like to see, in chunks. */
    radius: number;
    /**
     * The docs' Max ChunkRadius: the largest it is willing to accept, which the server may
     * reduce it to. Zero means the client did not state one.
     */
    maxRadius: number;
}

/**
 * How much world the client is asking for.
 *
 * Protocol 2193 wire order, with the field names Mojang's docs use: Chunk Radius (varint32,
 * ZigZag) then Max ChunkRadius (uint8).
 *
 * The single most important dial for a load test: view distance is quadratic in the chunks
 * a server has to generate, hold and send, so a fleet that forgets to ask for a small one
 * measures chunk generation rather than whatever it meant to measure.
 */
export default class RequestChunkRadiusPacket extends NetworkPacket<RequestChunkRadius> {
    public get id(): number {
        return PacketIdentifier.REQUEST_CHUNK_RADIUS;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: RequestChunkRadius): void {
        layoutAt(requestChunkRadiusPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): RequestChunkRadius {
        return layoutAt(requestChunkRadiusPacket, this.codecProtocol).decode(stream);
    }
}
