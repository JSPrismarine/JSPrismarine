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

    public decodePayload(): void {
        this.x = this.readVarInt();
        this.y = this.readVarInt();
        this.z = this.readVarInt();

        this.blockRuntimeId = this.readUnsignedVarInt();
        this.flags = this.readUnsignedVarInt();
        this.layer = this.readUnsignedVarInt();
    }

    public encodePayload(): void {
        // All three signed. The unsigned height was the layout up to protocol 924; `UBlockPos`
        // was removed entirely at 1.26.10 and every block position has been a signed `BlockPos`
        // since. The lengths still parsed either way, so nothing broke loudly - the client just
        // zig-zag decoded the height and put every block change at the wrong one.
        this.writeVarInt(this.x);
        this.writeVarInt(this.y);
        this.writeVarInt(this.z);

        this.writeUnsignedVarInt(this.blockRuntimeId);
        this.writeUnsignedVarInt(this.flags || UpdateBlockFlagsType.None);
        this.writeUnsignedVarInt(this.layer || UpdateBlockLayerType.Normal);
    }
}
