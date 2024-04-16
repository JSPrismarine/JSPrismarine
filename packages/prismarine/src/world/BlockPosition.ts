import type BinaryStream from '@jsprismarine/jsbinaryutils';
import { Vector3 } from '@jsprismarine/math';

export default class BlockPosition extends Vector3 {
    public override networkSerialize(stream: BinaryStream): void {
        stream.writeVarInt(this.x);
        stream.writeUnsignedVarInt(this.y);
        stream.writeVarInt(this.z);
    }

    // TODO: cleanup

    public signedNetworkSerialize(stream: BinaryStream): void {
        stream.writeVarInt(this.x);
        stream.writeVarInt(this.y);
        stream.writeVarInt(this.z);
    }

    public static fromVector3(vec: Vector3): BlockPosition {
        const position = vec.floor();
        return new BlockPosition(position.getX(), position.getY(), position.getZ());
    }

    public static override networkDeserialize(stream: BinaryStream): BlockPosition {
        return new BlockPosition(stream.readVarInt(), stream.readUnsignedVarInt(), stream.readVarInt());
    }
}
