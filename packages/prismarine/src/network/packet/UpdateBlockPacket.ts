import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export enum UpdateBlockLayerType {
    Normal = 0,
    Liquid = 1
}

export enum UpdateBlockFlagsType {
    None = 0b0000,
    Neighbors = 0b0001,
    Network = 0b0010,
    NoGraphic = 0b0100,
    Priority = 0b1000
}

export default class UpdateBlockPacket extends DataPacket {
    public static NetID = Identifiers.UpdateBlockPacket;

    public x!: number;
    public y!: number;
    public z!: number;
    public blockRuntimeId!: number;
    public flags!: UpdateBlockFlagsType;
    public layer!: UpdateBlockLayerType;

    public decodePayload() {
        this.x = this.readVarInt();
        this.y = this.readUnsignedVarInt();
        this.z = this.readVarInt();

        this.blockRuntimeId = this.readUnsignedVarInt();
        this.flags = this.readUnsignedVarInt();
        this.layer = this.readUnsignedVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.x);
        this.writeUnsignedVarInt(this.y);
        this.writeVarInt(this.z);

        this.writeUnsignedVarInt(this.blockRuntimeId);
        this.writeUnsignedVarInt(this.flags || UpdateBlockFlagsType.None);
        this.writeUnsignedVarInt(this.layer || UpdateBlockLayerType.Normal);
    }
}
