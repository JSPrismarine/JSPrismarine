import Item from '../../item/Item';
import NetworkTransactionSourceType from './NetworkTransactionSourceType';
import type PacketBinaryStream from '../PacketBinaryStream';

class NetworkTransaction {
    public sourceType!: number;
    public windowId!: number;
    public sourceFlags = 0;
    public slot!: number;

    public oldItem: any;
    public newItem: any;

    // 1.16
    public newItemStackId: any;

    public decode(buffer: PacketBinaryStream, hasItemStack = false) {
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
            //    This.server
            //        .getLogger()
            //        ?.warn(`Unknown source type ${this.sourceType}`);
        }

        this.slot = buffer.readUnsignedVarInt();
        this.oldItem = Item.networkDeserialize(buffer);
        this.newItem = Item.networkDeserialize(buffer);

        if (hasItemStack) {
            this.newItemStackId = buffer.readVarInt();
        }

        // TODO: move to packet binary stream
        return this;
    }
}

export default NetworkTransaction;
