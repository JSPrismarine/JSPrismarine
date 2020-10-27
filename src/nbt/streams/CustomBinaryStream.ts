import BinaryStream from '@jsprismarine/jsbinaryutils';

export default class CustomBinaryStream extends BinaryStream {
    constructor(buffer: Buffer, offset = 0) {
        super(buffer, offset);
    }

    public readString() {
        return this.read(this.readShort()).toString();
    }

    public writeString(str: string) {
        this.writeShort(Buffer.byteLength(str));
        this.append(Buffer.from(str, 'utf-8'));
    }
};
