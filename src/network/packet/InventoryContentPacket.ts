import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import type Item from '../../item/Item';

export default class InventoryContentPacket extends DataPacket {
    static NetID = Identifiers.InventoryContentPacket;

    public windowId!: number;
    public items: Array<Item> = [];

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
