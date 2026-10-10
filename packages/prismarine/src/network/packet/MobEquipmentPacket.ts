import { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * What an entity is holding, and which slot it came from.
 *
 * Sent both ways: the client says which hotbar slot the player has selected, and the server
 * tells everyone what another player is holding.
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | runtimeEntityId | UnsignedVarLong | |
 * | item | ItemStackWrapper | The held stack |
 * | inventorySlot | Byte | Where it lives in the inventory |
 * | hotbarSlot | Byte | Which hotbar slot points at it |
 * | windowId | Byte | The container it came from |
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
