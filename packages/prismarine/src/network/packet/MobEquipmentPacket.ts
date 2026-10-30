import { layoutAt, mobEquipmentPacket } from '@jsprismarine/protocol';

import { Item } from '../../item/Item';
import DataPacket from './DataPacket';

/**
 * What an entity is holding, and which slot it came from.
 *
 * Sent both ways: the client says which hotbar slot the player has selected, and the server
 * tells everyone what another player is holding.
 *
 * Protocol 2193 wire order. The field names in this class are the ones the rest of the
 * package uses; the docs' names are in the last column.
 *
 * | Name | Type | Docs name |
 * | ---- |:----:|:---------:|
 * | runtimeEntityId | varuint64 | Target Runtime ID |
 * | item | NetworkItemStackDescriptor | Item |
 * | inventorySlot | uint8 | Slot |
 * | hotbarSlot | uint8 | Selected Slot |
 * | windowId | uint8 | Container ID |
 *
 * An empty hand is an air stack, not an omission: the descriptor is a fixed set of fields
 * whatever the id is. See {@link Item.networkSerialize}.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/mob-equipment-packet/
 */
export default class MobEquipmentPacket extends DataPacket {
    public runtimeEntityId!: bigint;
    public item!: Item;
    public inventorySlot!: number;
    public hotbarSlot!: number;
    public windowId!: number;

    /**
     * Reading this used to be left out entirely, so a player changing hotbar slot told the
     * server nothing and the payload was left in the stream unread.
     */
    public decodePayload(): void {
        const read = layoutAt(mobEquipmentPacket, this.codecProtocol).decode(this);
        this.runtimeEntityId = read.runtimeEntityId;
        this.item = Item.fromStackDescriptor(this, read.item);
        this.inventorySlot = read.inventorySlot;
        this.hotbarSlot = read.hotbarSlot;
        this.windowId = read.windowId;
    }

    public encodePayload(): void {
        layoutAt(mobEquipmentPacket, this.codecProtocol).encode(this, {
            runtimeEntityId: this.runtimeEntityId,
            item: this.item.toStackDescriptor(this),
            inventorySlot: this.inventorySlot,
            hotbarSlot: this.hotbarSlot,
            windowId: this.windowId
        });
    }
}
