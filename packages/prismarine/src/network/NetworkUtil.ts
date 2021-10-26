import BinaryStream from '@jsprismarine/jsbinaryutils';

export default class McpeUtil {
    public static readString(stream: BinaryStream): string {
        const length = stream.readUnsignedVarInt();
        return stream.read(length).toString('utf-8');
    }

    public static writeString(stream: BinaryStream, str: string): void {
        const buffer = Buffer.from(str, 'utf-8');
        stream.writeUnsignedVarInt(buffer.byteLength);
        stream.append(buffer);
    }

    public static readLELengthASCIIString(stream: BinaryStream): string {
        const strLen = stream.readLInt();
        const str = stream.read(strLen).toString('ascii');
        return str;
    }

    public static writeLELengthASCIIString(stream: BinaryStream, str: string): void {
        const buf = Buffer.from(str, 'ascii');
        stream.writeLInt(buf.byteLength);
        stream.append(buf);
    }
}
