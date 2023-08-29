import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import BlockPosition from '../../world/BlockPosition.js';

export interface ChunkCoord {
    x: number;
    z: number;
}

export default class NetworkChunkPublisherUpdatePacket extends DataPacket {
    public static NetID = Identifiers.NetworkChunkPublisherUpdatePacket;

    public position!: BlockPosition;
    public radius!: number;
    public savedChunks!: ChunkCoord[];

    public override encodePayload(): void {
        this.position.signedNetworkSerialize(this);
        this.writeUnsignedVarInt(this.radius);
        this.writeUnsignedIntLE(this.savedChunks.length);
        for (const chunkCoord of this.savedChunks) {
            this.writeVarInt(chunkCoord.x);
            this.writeVarInt(chunkCoord.z);
        }
    }
}
