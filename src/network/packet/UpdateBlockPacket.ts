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

    public x: number = 0;
    public y: number = 0;
    public z: number = 0;
    public BlockRuntimeId: number = 0;
    public Flags: UpdateBlockFlagsType = UpdateBlockFlagsType.None;
    public Layer: UpdateBlockLayerType = UpdateBlockLayerType.Normal;

    public decodePayload() {
        this.x = this.readVarInt();
        this.y = this.readUnsignedVarInt();
        this.z = this.readVarInt();

        this.BlockRuntimeId = this.readUnsignedVarInt();
        this.Flags = this.readUnsignedVarInt();
        this.Layer = this.readUnsignedVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.x as number);
        this.writeUnsignedVarInt(this.y as number);
        this.writeVarInt(this.z as number);

        this.writeUnsignedVarInt(this.BlockRuntimeId as number);
        this.writeUnsignedVarInt(this.Flags);
        this.writeUnsignedVarInt(this.Layer);
    }
}
