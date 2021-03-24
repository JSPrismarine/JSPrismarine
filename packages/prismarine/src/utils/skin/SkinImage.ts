import BinaryStream from '@jsprismarine/jsbinaryutils';

export default class SkinImage {
    public width: number;
    public height: number;
    public data: Buffer;

    public constructor({ width, height, data }: { width: number; height: number; data: Buffer }) {
        this.width = width;
        this.height = height;
        this.data = data;
    }

    // TODO: API

    public networkSerialize(stream: BinaryStream): void {
        stream.writeLInt(this.width);
        stream.writeLInt(this.height);
        stream.writeUnsignedVarInt(this.data.length);
        stream.append(this.data);
    }

    public static networkDeserialize(stream: BinaryStream): SkinImage {
        const width = stream.readLInt();
        const height = stream.readLInt();
        const length = stream.readUnsignedVarInt();
        const data = stream.read(length);
        return new SkinImage({
            width,
            height,
            data
        });
    }
}
