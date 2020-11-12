import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export enum UpdateBlockLayerType {
    Normal = 0,
    Liquid = 1
}

export enum UpdateBlockFlagsType {
    None = 0b0000
}

export default class UpdateBlockPacket extends DataPacket {
    static NetID = Identifiers.UpdateBlockPacket;

    public x!: number;
    public y!: number;
    public z!: number;
    public BlockRuntimeId!: number;
    public Flags!: UpdateBlockFlagsType;
    public Layer!: UpdateBlockLayerType;

    public decodePayload() {
        this.x = this.readVarInt();
        this.y = this.readUnsignedVarInt();
        this.z = this.readVarInt();

        this.BlockRuntimeId = this.readUnsignedVarInt();
        this.Flags = this.readUnsignedVarInt();
        this.Layer = this.readUnsignedVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.x);
        this.writeUnsignedVarInt(this.y);
        this.writeVarInt(this.z);

        this.writeUnsignedVarInt(this.BlockRuntimeId);
        this.writeUnsignedVarInt(this.Flags || UpdateBlockFlagsType.None);
        this.writeUnsignedVarInt(this.Layer || UpdateBlockLayerType.Normal);
    }
}
