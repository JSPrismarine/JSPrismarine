import Identifiers from "../identifiers";
import DataPacket from "./Packet";

export enum UpdateBlockLayerType {
    Normal = 0,
    Liquid = 1
};

export enum UpdateBlockFlagsType {
    None = 0b0000
};

export default class UpdateBlockPacket extends DataPacket {
    static NetID = Identifiers.UpdateBlockPacket

    x: number = 0.0;
    y: number = 0;
    z: number = 0;
    BlockRuntimeId: number = 0;
    Flags: UpdateBlockFlagsType = UpdateBlockFlagsType.None;
    Layer: UpdateBlockLayerType = UpdateBlockLayerType.Normal;

    encodePayload() {
        this.writeVarInt(this.x);
        this.writeUnsignedVarInt(this.y);
        this.writeVarInt(this.z);

        this.writeUnsignedVarInt(this.BlockRuntimeId);
        this.writeUnsignedVarInt(this.Flags);
        this.writeUnsignedVarInt(this.Layer);
    }
}
