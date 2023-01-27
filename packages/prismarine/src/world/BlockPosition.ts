// import BinaryStream from '@jsprismarine/jsbinaryutils';
import Vector3 from '../math/Vector3.js';

export default class BlockPosition extends Vector3 {
    public networkSerialize(stream: any): void {
        stream.writeVarInt(this.getX());
        stream.writeUnsignedVarInt(this.getY());
        stream.writeVarInt(this.getZ());
    }

    public static networkDeserialize(stream: any): BlockPosition {
        return new BlockPosition(stream.readVarInt(), stream.readUnsignedVarInt(), stream.readVarInt());
    }
}
