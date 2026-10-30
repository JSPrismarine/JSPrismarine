import { ContainerUiId } from '@jsprismarine/minecraft';
import { inventorySlotPacket } from '../wire/definitions/containers';
import { layoutAt } from '../wire/WireLayout';
import FieldNetworkPacket from '../FieldNetworkPacket';

import { emptyItemStackDescriptor } from '../wire/structures/ItemStackDescriptor';
import type { ItemStackDescriptorData } from '../wire/structures/ItemStackDescriptor';

/**
 * One slot of a container, changed.
 *
 * This packet updates clients that did not submit the inventory request. Its item and optional
 * storage item are wire descriptors; the server converts game items before creating the packet.
 *
 * Protocol 2193 wire order: `Container Id` and `Slot` (varuint32), optional `Full Container
 * Name`, optional `Storage Item`, and a required `Item` descriptor. An empty slot still carries
 * the complete empty descriptor.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/inventory-slot-packet/
 */
export default class InventorySlotPacket extends FieldNetworkPacket {
    /** `Container Id`; the player's own crafting grid is 124. */
    public windowId!: number;

    /** `Slot`, in the client's numbering. */
    public inventorySlot!: number;

    /** The container kind named by `Full Container Name`. */
    public containerId: number = ContainerUiId.CRAFTING_INPUT;

    /** Distinguishes multiple open containers of the same kind when needed. */
    public dynamicId: number | null = null;

    /** Descriptor for the new slot contents; `null` means an empty stack. */
    public item: ItemStackDescriptorData | null = null;

    /** Writes the five fields in the order documented for this packet. */
    public encodePayload(): void {
        layoutAt(inventorySlotPacket, this.codecProtocol).encode(this, {
            windowId: this.windowId,
            inventorySlot: this.inventorySlot,
            fullContainerName: { containerId: this.containerId, dynamicId: this.dynamicId },
            storageItem: null,
            item: this.item ?? emptyItemStackDescriptor()
        });
    }

    /** Reads the descriptor without resolving it into the server's item model. */
    public decodePayload(): void {
        const read = layoutAt(inventorySlotPacket, this.codecProtocol).decode(this);
        this.windowId = read.windowId;
        this.inventorySlot = read.inventorySlot;

        if (read.fullContainerName !== null) {
            this.containerId = read.fullContainerName.containerId;
            this.dynamicId = read.fullContainerName.dynamicId;
        }

        this.item = read.item.id === 0 ? null : read.item;
    }
}
