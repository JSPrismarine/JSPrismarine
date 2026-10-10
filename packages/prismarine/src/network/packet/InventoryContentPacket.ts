import type ContainerEntry from '../../inventory/ContainerEntry';
import { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import { ContainerUiId } from '../type/ItemStackRequest';
import DataPacket from './DataPacket';

/**
 * Everything one container holds, in one go.
 *
 * This is how the client learns what is in the player's inventory. Without it the client has
 * no model of those slots at all, and under the server authoritative inventory system it will
 * not move a stack into a container it has never been told about - which is what left an item
 * refusing to come off its slot however it was dragged.
 *
 * **Bound To:** Client
 */
export default class InventoryContentPacket extends DataPacket {
    public static NetID = Identifiers.InventoryContentPacket;

    public windowId!: number;
    public items: ContainerEntry[] = [];

    /** Which UI container these slots belong to; the player's own by default. */
    public containerId: number = ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY;

    /** Set only when several containers of one kind are open at once. */
    public dynamicId: number | null = null;

    public encodePayload(): void {
        this.writeUnsignedVarInt(this.windowId);

        // Each stack in the form that carries a net id flag - an inventory's stacks are
        // tracked, unlike the creative menu's. There is no slot index: position is the slot,
        // and writing one made every stack land one field into the next.
        this.writeUnsignedVarInt(this.items.length);
        for (const entry of this.items) {
            entry.toItemStack().networkSerialize(this);
        }

        this.writeByte(this.containerId);
        this.writeBoolean(this.dynamicId !== null);
        if (this.dynamicId !== null) this.writeIntLE(this.dynamicId);

        // The storage item: what a bundle-like container is itself held as. Nothing here has
        // one - but air is no longer a bare zero, it is a full empty stack, so it is written
        // as one rather than by hand.
        Item.air().networkSerialize(this);
    }
}
