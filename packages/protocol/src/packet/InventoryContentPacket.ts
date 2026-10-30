import { ContainerUiId } from '@jsprismarine/minecraft';
import { inventoryContentPacket } from '../wire/definitions/containers';
import { layoutAt } from '../wire/WireLayout';
import FieldNetworkPacket from '../FieldNetworkPacket';

import { emptyItemStackDescriptor } from '../wire/structures/ItemStackDescriptor';
import type { ItemStackDescriptorData } from '../wire/structures/ItemStackDescriptor';

/**
 * Everything one container holds, in one packet.
 *
 * The client needs a complete slot list before it can move stacks between a player's inventory
 * and a container. Each slot is a `NetworkItemStackDescriptor`; the server resolves its game
 * items into these protocol DTOs before constructing the packet.
 *
 * Protocol 2193 wire order: `Container Id` (varuint32), `Slots` (a varuint count followed by
 * descriptors), `Full Container Name`, and `Storage Item`. The last two fields are required
 * here, unlike in `InventorySlotPacket`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/inventory-content-packet/
 */
export default class InventoryContentPacket extends FieldNetworkPacket {
    /** `Container Id`: the window these slots belong to. */
    public windowId!: number;

    /** `Slots`: one item descriptor per slot, in order. */
    public items: ItemStackDescriptorData[] = [];

    /** The container kind named by `Full Container Name`. */
    public containerId: number = ContainerUiId.COMBINED_HOTBAR_AND_INVENTORY;

    /** Distinguishes multiple open containers of the same kind when needed. */
    public dynamicId: number | null = null;

    /** Writes the four fields in the order documented for this packet. */
    public encodePayload(): void {
        layoutAt(inventoryContentPacket, this.codecProtocol).encode(this, {
            windowId: this.windowId,
            slots: this.items,
            fullContainerName: { containerId: this.containerId, dynamicId: this.dynamicId },
            storageItem: emptyItemStackDescriptor()
        });
    }

    /** Reads the descriptor list and container name without resolving game items. */
    public decodePayload(): void {
        const read = layoutAt(inventoryContentPacket, this.codecProtocol).decode(this);
        this.windowId = read.windowId;
        this.items = read.slots;
        this.containerId = read.fullContainerName.containerId;
        this.dynamicId = read.fullContainerName.dynamicId;
    }
}
