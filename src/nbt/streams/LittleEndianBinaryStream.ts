import CustomBinaryStream from './CustomBinaryStream';

export default class LittleEndianBinaryStream extends CustomBinaryStream {
    readShort() {
        return this.readLShort();
    }

    readSignedShort() {
        return this.readSignedLShort();
    }

    writeShort(v: number) {
        this.writeLShort(v);
    }

    readInt() {
        return this.readLInt();
    }

    writeInt(v: number) {
        this.writeLInt(v);
    }

    readLong() {
        return this.readLLong();
    }

    writeLong(v: bigint) {
        this.writeLLong(v);
    }

    readFloat() {
        return this.readLFloat();
    }

    writeFloat(v: number) {
        this.writeLFloat(v);
    }

    readDouble() {
        return this.readLDouble();
    }

    writeDouble(v: number) {
        return this.writeLDouble(v);
    }
}
