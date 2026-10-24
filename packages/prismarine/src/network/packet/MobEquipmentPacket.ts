import { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
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
    public static NetID = Identifiers.MobEquipmentPacket;

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
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.item = Item.networkDeserialize(this);
        this.inventorySlot = this.readByte();
        this.hotbarSlot = this.readByte();
        this.windowId = this.readByte();
    }

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.item.networkSerialize(this);
        this.writeByte(this.inventorySlot);
        this.writeByte(this.hotbarSlot);
        this.writeByte(this.windowId);
    }
}
