import type BinaryStream from '@jsprismarine/jsbinaryutils';

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
        stream.writeUnsignedIntLE(this.width);
        stream.writeUnsignedIntLE(this.height);
        stream.writeUnsignedVarInt(this.data.length);
        stream.write(this.data);
    }

    public static networkDeserialize(stream: BinaryStream): SkinImage {
        const width = stream.readUnsignedIntLE();
        const height = stream.readUnsignedIntLE();
        const length = stream.readUnsignedVarInt();
        const data = stream.read(length);
        return new SkinImage({
            width,
            height,
            data
        });
    }
}
