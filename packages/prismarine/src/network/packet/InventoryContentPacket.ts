import { inventoryContentPacket, layoutAt } from '@jsprismarine/protocol';

import ContainerEntry from '../../inventory/ContainerEntry';
import { Item } from '../../item/Item';
import { ContainerUiId } from '../type/ItemStackRequest';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * Everything one container holds, in one go.
 *
 * This is how the client learns what is in the player's inventory. Without it the client has
 * no model of those slots at all, and under the server authoritative inventory system it will
 * not move a stack into a container it has never been told about - which is what left an item
 * refusing to come off its slot however it was dragged.
 *
 * Wire order at protocol 2193: `Container Id` (varuint32), `Slots` (a varuint count then one
 * `NetworkItemStackDescriptor` each), `Full Container Name`, `Storage Item`. Neither of the
 * last two is an optional here, unlike in `InventorySlotPacket`.
 *
 * **Bound To:** Client
 */
export default class InventoryContentPacket extends FieldNetworkPacket {
    /** `Container Id`: the window these slots belong to. */
    public windowId!: number;

    /** `Slots`: every slot of the container, in order. */
    public items: ContainerEntry[] = [];

    /** The `Container Name` of `Full Container Name`; the player's own by default. */
    public containerId: number = ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY;

    /** The `Dynamic ID` of `Full Container Name`, absent unless several of a kind are open. */
    public dynamicId: number | null = null;

    /** Writes the four fields in docs order. */
    public encodePayload(): void {
        layoutAt(inventoryContentPacket, this.codecProtocol).encode(this, {
            windowId: this.windowId,
            // Each stack in the form that carries a net id flag - an inventory's stacks are
            // tracked, unlike the creative menu's. There is no slot index: position is the
            // slot, and writing one made every stack land one field into the next.
            slots: this.items.map((entry) => {
                const item = entry.toItemStack();
                // The id the client will name the stack by in its requests. Air has none, and
                // neither does a stack nothing has given one yet.
                return item.toStackDescriptor(this, item.stackNetworkId > 0 ? item.stackNetworkId : null);
            }),
            fullContainerName: { containerId: this.containerId, dynamicId: this.dynamicId },
            // The storage item: what a bundle-like container is itself held as. Nothing here
            // has one - but air is no longer a bare zero, it is a full empty stack.
            storageItem: Item.air().toStackDescriptor(this)
        });
    }

    /** Reads the four fields in docs order, as {@link InventoryContentPacket.encodePayload} writes them. */
    public decodePayload(): void {
        const read = layoutAt(inventoryContentPacket, this.codecProtocol).decode(this);
        this.windowId = read.windowId;

        this.items = read.slots.map((slot) => {
            const item = Item.fromStackDescriptor(this, slot);
            // An empty slot holds nothing, whatever count the reader gave its air.
            return item.getName() === 'minecraft:air'
                ? new ContainerEntry({ item })
                : new ContainerEntry({ item, count: item.getAmount() });
        });

        this.containerId = read.fullContainerName.containerId;
        this.dynamicId = read.fullContainerName.dynamicId;

        // The storage item is read past and not kept: nothing here is held in one.
    }
}
