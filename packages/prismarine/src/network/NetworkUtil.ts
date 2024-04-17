import type BinaryStream from '@jsprismarine/jsbinaryutils';
import { Vector3 } from '@jsprismarine/math';
import BlockPosition from '../world/BlockPosition';

export class NetworkUtil {
    public static readString(stream: BinaryStream): string {
        const length = stream.readUnsignedVarInt();
        return stream.read(length).toString('utf-8');
    }
    public static writeString(stream: BinaryStream, str: string): void {
        const buffer = Buffer.from(str, 'utf-8');
        stream.writeUnsignedVarInt(buffer.byteLength);
        stream.write(buffer);
    }

    public static readLELengthASCIIString(stream: BinaryStream): string {
        const strLen = stream.readUnsignedIntLE();
        const str = stream.read(strLen).toString('ascii');
        return str;
    }
    public static writeLELengthASCIIString(stream: BinaryStream, str: string): void {
        const buf = Buffer.from(str, 'ascii');
        stream.writeUnsignedIntLE(buf.byteLength);
        stream.write(buf);
    }

    /**
     * Serialize a `Vector3` instance into a `BinaryStream`.
     * @param {BinaryStream} stream - The network stream.
     * @param {Vector3} vec - The vector to serialize.
     */
    public static writeVector3(stream: BinaryStream, vec: Vector3 | null): void {
        if (!vec) {
            NetworkUtil.writeVector3(stream, Vector3.ZERO);
            return;
        }

        stream.writeFloatLE(vec.getX());
        stream.writeFloatLE(vec.getY());
        stream.writeFloatLE(vec.getZ());
    }
    /**
     * Deserialize a `Vector3` from a `BinaryStream`.
     * @param {BinaryStream} stream - The network stream.
     * @returns {Vector3} The deserialized `Vector3`.
     */
    public static readVector3(stream: BinaryStream): Vector3 {
        return new Vector3(stream.readFloatLE(), stream.readFloatLE(), stream.readFloatLE());
    }

    /**
     * Serialize a `BlockPosition` instance into a `BinaryStream`.
     * @param {BinaryStream} stream - The network stream.
     * @param {BlockPosition} pos - The block position to serialize.
     */
    public static writeBlockPosition(stream: BinaryStream, pos: BlockPosition): void {
        stream.writeVarInt(pos.getX());
        stream.writeVarInt(pos.getY());
        stream.writeVarInt(pos.getZ());
    }
    /**
     * Serialize a `BlockPosition` instance into a `BinaryStream`.
     * @param {BinaryStream} stream - The network stream.
     * @param {BlockPosition} pos - The block position to serialize.
     */
    public static writeUnsignedBlockPosition(stream: BinaryStream, pos: BlockPosition): void {
        stream.writeVarInt(pos.getX());
        stream.writeUnsignedVarInt(pos.getY());
        stream.writeVarInt(pos.getZ());
    }
    /**
     * Deserialize a `BlockPosition` from a `BinaryStream`.
     * @param {BinaryStream} stream - The network stream.
     * @returns {BlockPosition} The deserialized `BlockPosition`.
     */
    public static readBlockPosition(stream: BinaryStream): Vector3 {
        return new BlockPosition(stream.readVarInt(), stream.readUnsignedVarInt(), stream.readVarInt());
    }
}
