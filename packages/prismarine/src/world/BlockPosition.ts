import BinaryStream from '@jsprismarine/jsbinaryutils';
import Vector3 from '../math/Vector3';

export default class BlockPosition extends Vector3 {
    public networkSerialize(stream: BinaryStream): void {
        stream.writeVarInt(this.getX());
        stream.writeUnsignedVarInt(this.getY());
        stream.writeVarInt(this.getX());
    }

    public static networkDeserialize(stream: BinaryStream): BlockPosition {
        return new BlockPosition(stream.readVarInt(), stream.readUnsignedVarInt(), stream.readVarInt());
    }
}
