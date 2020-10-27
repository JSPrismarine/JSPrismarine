import LittleEndianBinaryStream from './LittleEndianBinaryStream';

export default class NetworkLittleEndianBinaryStream extends LittleEndianBinaryStream {
    readInt() {
        return this.readVarInt();
    }

    writeInt(v: number) {
        this.writeVarInt(v);
    }

    readLong() {
        return this.readVarLong();
    }

    writeLong(v: bigint) {
        this.writeVarLong(v);
    }

    readString() {
        return this.read(this.readUnsignedVarInt()).toString();
    }

    writeString(str: string) {
        this.writeUnsignedVarInt(Buffer.byteLength(str));
        this.append(Buffer.from(str, 'utf-8'));
    }
};
