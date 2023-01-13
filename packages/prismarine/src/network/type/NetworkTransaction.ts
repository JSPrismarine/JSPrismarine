// import BinaryStream from '@jsprismarine/jsbinaryutils';
import Item from '../../item/Item.js';
import NetworkTransactionSourceType from './NetworkTransactionSourceType.js';

export default class NetworkTransaction {
    public sourceType!: number;
    public windowId!: number;
    public sourceFlags = 0;
    public slot!: number;

    public oldItem: any;
    public newItem: any;

    // 1.16
    public newItemStackId: any;

    public decode(buffer: any, hasItemStack = false) {
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
        this.oldItem = Item.networkDeserialize(buffer, true);
        this.newItem = Item.networkDeserialize(buffer, true);

        if (hasItemStack) {
            this.newItemStackId = buffer.readVarInt();
        }

        // TODO: move to packet binary stream
        return this;
    }
}
