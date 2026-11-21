import type BinaryStream from '@jsprismarine/binaryutils';

/** Pixel dimensions and RGBA bytes for a skin or cape image. */
export default class SkinImage {
    public width: number;
    public height: number;
    public data: Buffer;

    public constructor({ width, height, data }: { width: number; height: number; data: Buffer }) {
        this.width = width;
        this.height = height;
        this.data = data;
    }

    /** Writes dimensions, byte length, and image data in the `SkinImage` wire format. */
    public networkSerialize(stream: BinaryStream): void {
        stream.writeUnsignedIntLE(this.width);
        stream.writeUnsignedIntLE(this.height);
        stream.writeUnsignedVarInt(this.data.length);
        stream.write(this.data);
    }

    /** Reads a `SkinImage` from its dimensions and length-prefixed image bytes. */
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
