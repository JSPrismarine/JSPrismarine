import type PacketBinaryStream from '../PacketBinaryStream';
import NetworkTransactionSourceType from './NetworkTransactionSourceType';

class NetworkTransaction {
    public sourceType!: number;
    public windowId!: number;
    public sourceFlags: number = 0;
    public slot!: number;

    public oldItem: any;
    public newItem: any;

    // 1.16
    public newItemStackId: any;

    decode(buffer: PacketBinaryStream, hasItemStack = false) {
        this.sourceType = buffer.readUnsignedVarInt();

        switch (this.sourceType) {
            case NetworkTransactionSourceType.Container:
            case NetworkTransactionSourceType.Unknown:
            case NetworkTransactionSourceType.CraftingGrid:
                this.windowId = buffer.readVarInt();
                break;
            case NetworkTransactionSourceType.World:
                this.sourceFlags = buffer.readUnsignedVarInt();
                break;
            case NetworkTransactionSourceType.Creative:
                break;
            default:
            //    this.server
            //        .getLogger()
            //        .warn(`Unknown source type ${this.sourceType}`);
        }

        this.slot = buffer.readUnsignedVarInt();
        this.oldItem = buffer.readItemStack();
        this.newItem = buffer.readItemStack();

        if (hasItemStack) {
            this.newItemStackId = buffer.readVarInt();
        }

        // TODO: move to packet binary stream
        return this;
    }
}

export default NetworkTransaction;
