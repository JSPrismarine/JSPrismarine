import type Block from '../../block/Block';
import type Item from '../../item/Item';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class InventoryContentPacket extends DataPacket {
    static NetID = Identifiers.InventoryContentPacket;

    public windowId: number = 0;
    public items: Array<Item | Block> = [];

    public encodePayload() {
        this.writeUnsignedVarInt(this.windowId);

        // Write item stacks
        this.writeUnsignedVarInt(this.items.length);
        for (let i = 0; i < this.items.length; i++) {
            this.writeItemStack(this.items[i]);
        }
    }
}
