import type Block from '../../block/Block';
import type Item from '../../item/Item';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class InventoryContentPacket extends DataPacket {
    static NetID = Identifiers.InventoryContentPacket;

    public windowId!: number;
    public items: Array<Item | Block> = [];

    public encodePayload() {
        this.writeUnsignedVarInt(this.windowId);

        // Write item stacks
        this.writeUnsignedVarInt(this.items.length);
        for (let i = 0; i < this.items.length; i++) {
            this.writeVarInt(i + 1); // slot index
            this.writeItemStack(this.items[i]);
        }
    }
}
