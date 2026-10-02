import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

export interface RequestChunkRadius {
    /** How far the client would like to see, in chunks. */
    radius: number;
    /** The largest it is willing to accept, which the server may reduce it to. */
    maxRadius: number;
}

/**
 * How much world the client is asking for.
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
        stream.writeVarInt(data.radius);
        stream.writeByte(data.maxRadius);
    }

    protected deserializePayload(stream: NetworkBinaryStream): RequestChunkRadius {
        return { radius: stream.readVarInt(), maxRadius: stream.readByte() };
    }
}
