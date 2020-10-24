import Identifiers from "../Identifiers";
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

    x: VarInt = 0;
    y: UnsignedVarInt = 0;
    z: VarInt = 0;
    BlockRuntimeId: UnsignedVarInt = 0;
    Flags: UpdateBlockFlagsType = UpdateBlockFlagsType.None;
    Layer: UpdateBlockLayerType = UpdateBlockLayerType.Normal;

    decodePayload() {
        this.x = this.readVarInt();
        this.y = this.readUnsignedVarInt();
        this.z = this.readVarInt();

        this.BlockRuntimeId = this.readUnsignedVarInt();
        this.Flags = this.readUnsignedVarInt();
        this.Layer = this.readUnsignedVarInt();
    }

    encodePayload() {
        this.writeVarInt(this.x);
        this.writeUnsignedVarInt(this.y);
        this.writeVarInt(this.z);

        this.writeUnsignedVarInt(this.BlockRuntimeId);
        this.writeUnsignedVarInt(this.Flags);
        this.writeUnsignedVarInt(this.Layer);
    }
};
