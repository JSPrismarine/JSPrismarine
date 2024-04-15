import type BinaryStream from '@jsprismarine/jsbinaryutils';

export class SyncedProperties {
    public intProps: number[] = [];
    public floatProps: number[] = [];

    public networkSerialize(stream: BinaryStream): void {
        stream.writeUnsignedVarInt(this.intProps.length);
        this.intProps.map((index, value) => {
            stream.writeUnsignedVarInt(index);
            stream.writeVarInt(value);
        });

        stream.writeUnsignedVarInt(this.floatProps.length);
        this.floatProps.map((index, value) => {
            stream.writeUnsignedVarInt(index);
            stream.writeVarInt(value);
        });
    }
}
