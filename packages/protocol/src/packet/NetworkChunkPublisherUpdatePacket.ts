import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { networkChunkPublisherUpdatePacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../wire/WireLayout';
import type { PayloadOf } from '../wire/define';

import type NetworkBinaryStream from '../NetworkBinaryStream';

type WirePayload = PayloadOf<typeof networkChunkPublisherUpdatePacket>;

/** One entry of `Server Built Chunks List`: an X and a Z chunk coordinate. */
export interface ChunkCoord extends Record<string, number> {
    /** `X` of the chunk column. */
    x: number;
    /** `Z` of the chunk column. */
    z: number;
}

/** The payload of {@link NetworkChunkPublisherUpdatePacket}. */
export type NetworkChunkPublisherUpdatePayload = Omit<WirePayload, 'savedChunks'> & {
    savedChunks: ChunkCoord[];
};

/**
 * Moves the point the client keeps chunks loaded around.
 *
 * The payload carries `New position for view` as a `BlockPos`, `New radius for view` as a
 * varuint32 measured in blocks, and `Server Built Chunks List` as a little-endian uint32 count
 * followed by chunk-coordinate pairs. The client renders nothing until it receives this packet,
 * and the radius around the position controls which received chunks remain visible.
 *
 * The list contains chunks the server will build for a client that generates terrain itself.
 * An empty list is intentional for ordinary server-generated terrain; the client treats a
 * provided list as the complete set rather than adding each update to the previous one.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/network-chunk-publisher-update-packet/
 */
export default class NetworkChunkPublisherUpdatePacket extends NetworkPacket<NetworkChunkPublisherUpdatePayload> {
    public get id(): number {
        return PacketIdentifier.NETWORK_CHUNK_PUBLISHER_UPDATE;
    }

    public constructor(packetData?: NetworkChunkPublisherUpdatePayload | Buffer | null, buffer?: Buffer) {
        super(
            Buffer.isBuffer(packetData) ? null : (packetData ?? null),
            Buffer.isBuffer(packetData) ? packetData : buffer
        );
    }

    protected serializePayload(stream: NetworkBinaryStream, data: NetworkChunkPublisherUpdatePayload): void {
        layoutAt(networkChunkPublisherUpdatePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): NetworkChunkPublisherUpdatePayload {
        const data = layoutAt(networkChunkPublisherUpdatePacket, this.codecProtocol).decode(stream);
        const savedChunks = data.savedChunks.map((chunk) => {
            const x = chunk.x;
            const z = chunk.z;
            if (typeof x !== 'number' || typeof z !== 'number')
                throw new TypeError('A chunk coordinate pair must have numeric x and z fields');
            return { x, z };
        });
        return { ...data, savedChunks };
    }
}
