import type ContainerEntry from '../../inventory/ContainerEntry';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class InventoryContentPacket extends DataPacket {
    public static NetID = Identifiers.InventoryContentPacket;

    public windowId!: number;
    public items: ContainerEntry[] = [];

    public encodePayload(): void {
        this.writeUnsignedVarInt(this.windowId);

        // Write item stacks
        this.writeUnsignedVarInt(this.items.length);
        for (let i = 0; i < this.items.length; i++) {
            this.writeVarInt(i + 1); // Slot index
            this.items[i]!.getItem().networkSerialize(this);
        }
    }
}
