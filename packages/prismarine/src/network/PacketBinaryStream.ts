import BinaryStream from '@jsprismarine/jsbinaryutils';

export default class PacketBinaryStream extends BinaryStream {
    public readString(): string {
        return this.read(this.readUnsignedVarInt()).toString();
    }

    public writeString(v: string): void {
        this.writeUnsignedVarInt(Buffer.byteLength(v));
        this.append(Buffer.from(v, 'utf8'));
    }
}
