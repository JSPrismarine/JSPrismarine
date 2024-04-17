import type BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

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
        NetworkUtil.writeBlockPosition(this, this.position);
        this.writeUnsignedVarInt(this.radius);
        this.writeUnsignedIntLE(this.savedChunks.length);
        for (const chunkCoord of this.savedChunks) {
            this.writeVarInt(chunkCoord.x);
            this.writeVarInt(chunkCoord.z);
        }
    }
}
