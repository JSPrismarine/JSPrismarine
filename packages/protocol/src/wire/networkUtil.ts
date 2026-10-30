import type BinaryStream from '@jsprismarine/binaryutils';
import { Vector3 } from '@jsprismarine/math';

/** Shared readers and writers for strings, vectors, and block positions used by packet codecs. */
export class NetworkUtil {
    /** Reads a UTF-8 string prefixed by its varuint32 byte length. */
    public static readString(stream: BinaryStream): string {
        const length = stream.readUnsignedVarInt();
        return stream.read(length).toString('utf-8');
    }
    /** Writes a UTF-8 string prefixed by its varuint32 byte length. */
    public static writeString(stream: BinaryStream, str: string): void {
        const buffer = Buffer.from(str, 'utf-8');
        stream.writeUnsignedVarInt(buffer.byteLength);
        stream.write(buffer);
    }

    /** Reads an ASCII string prefixed by a little-endian uint32 byte length. */
    public static readLELengthASCIIString(stream: BinaryStream): string {
        const strLen = stream.readUnsignedIntLE();
        const str = stream.read(strLen).toString('ascii');
        return str;
    }
    /** Writes an ASCII string prefixed by a little-endian uint32 byte length. */
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
     * Serialize a block position into a `BinaryStream`.
     * @param {BinaryStream} stream - The network stream.
     * @param {Vector3} pos - The block position to serialize.
     */
    public static writeBlockPosition(stream: BinaryStream, pos: Vector3): void {
        stream.writeVarInt(pos.getX());
        stream.writeVarInt(pos.getY());
        stream.writeVarInt(pos.getZ());
    }
    /**
     * Deserialize a block position from a `BinaryStream`.
     *
     * Three signed varints. The y used to be read unsigned, which was the layout of the
     * packets a client sent up to 1.26.0 - `PlayerAction` among them - and has not been since
     * 1.26.10: every block position the protocol carries is `BlockPos` now, signed all the
     * way through. Read unsigned, a zigzag encoded y comes out doubled (64 reads as 128)
     * and anything below sea level as a number in the billions.
     * @param {BinaryStream} stream - The network stream.
     * @returns {Vector3} The deserialized block position.
     */
    public static readBlockPosition(stream: BinaryStream): Vector3 {
        return new Vector3(stream.readVarInt(), stream.readVarInt(), stream.readVarInt());
    }
}
