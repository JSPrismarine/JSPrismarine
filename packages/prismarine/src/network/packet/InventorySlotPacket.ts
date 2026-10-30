import { inventorySlotPacket, layoutAt } from '@jsprismarine/protocol';

import { Item } from '../../item/Item';
import { ContainerUiId } from '../type/ItemStackRequest';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

/**
 * One slot of one container, changed.
 *
 * The counterpart to `InventoryContentPacket` for a single slot, and the only way to tell a
 * client about a slot it did not ask about. An `ItemStackResponse` only reaches the client that
 * sent the request, so another player with the same chest open learns of a change through this.
 *
 * Wire order at protocol 2193: `Container Id` (varuint32, despite the docs page typing it as
 * a uint8 - gophertunnel and PocketMine both read a varuint here), `Slot` (varuint32),
 * `Full Container Name` as an optional, `Storage Item` as an optional
 * `NetworkItemStackDescriptor`, then `Item`.
 *
 * **Bound To:** Client
 */
export default class InventorySlotPacket extends FieldNetworkPacket {
    /** `Container Id`; the crafting grid lives in the player's own UI, which is 124. */
    public windowId!: number;

    /** `Slot`, in the client's numbering - 28 upwards for the inventory's crafting grid. */
    public inventorySlot!: number;

    /** The `Container Name` of `Full Container Name`. */
    public containerId: number = ContainerUiId.CRAFTING_INPUT;

    /** The `Dynamic ID` of `Full Container Name`, absent unless several of a kind are open. */
    public dynamicId: number | null = null;

    /** `Item`: what is in the slot now. `null` empties it. */
    public item: Item | null = null;

    /** Writes the five fields in docs order. */
    public encodePayload(): void {
        // A stack goes out with the id the client will name it by, when it has one. Air is a
        // whole item instance - eight bytes - not a bare zero: writing one byte here ended the
        // packet seven bytes early, which a real client reads as a malformed packet and hangs
        // up on.
        const item = this.item ?? Item.air();
        const stackNetId = this.item && this.item.stackNetworkId > 0 ? this.item.stackNetworkId : null;

        layoutAt(inventorySlotPacket, this.codecProtocol).encode(this, {
            windowId: this.windowId,
            inventorySlot: this.inventorySlot,
            // The container name is itself optional, and the presence byte was missing: the
            // client read the container id in its place, and every field after it landed a
            // byte out.
            fullContainerName: { containerId: this.containerId, dynamicId: this.dynamicId },
            // The storage item, which is what a bundle-like container is itself held as.
            // Nothing here has one, so the optional is simply absent.
            storageItem: null,
            item: item.toStackDescriptor(this, stackNetId)
        });
    }

    /** Reads the five fields in docs order, as {@link InventorySlotPacket.encodePayload} writes them. */
    public decodePayload(): void {
        const read = layoutAt(inventorySlotPacket, this.codecProtocol).decode(this);
        this.windowId = read.windowId;
        this.inventorySlot = read.inventorySlot;

        if (read.fullContainerName !== null) {
            this.containerId = read.fullContainerName.containerId;
            this.dynamicId = read.fullContainerName.dynamicId;
        }

        // The storage item is read past and not kept: nothing here is held in one.
        // An emptied slot arrives as a whole air stack, and an empty slot is `null` here.
        const item = Item.fromStackDescriptor(this, read.item);
        this.item = item.getName() === 'minecraft:air' ? null : item;
    }
}
