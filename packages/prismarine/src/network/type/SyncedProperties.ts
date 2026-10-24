import type BinaryStream from '@jsprismarine/binaryutils';

export class SyncedProperties {
    public intProps: number[] = [];
    public floatProps: number[] = [];

    public networkSerialize(stream: BinaryStream): void {
        stream.writeUnsignedVarInt(this.intProps.length);
        this.intProps.forEach((index, value) => {
            stream.writeUnsignedVarInt(index);
            stream.writeVarInt(value);
        });

        stream.writeUnsignedVarInt(this.floatProps.length);
        this.floatProps.forEach((index, value) => {
            stream.writeUnsignedVarInt(index);
            stream.writeVarInt(value);
        });
    }
}
