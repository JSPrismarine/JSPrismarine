import type { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class MobEquipmentPacket extends DataPacket {
    public static NetID = Identifiers.MobEquipmentPacket;

    public runtimeEntityId!: bigint;
    public item!: Item;
    public inventorySlot!: number;
    public hotbarSlot!: number;
    public windowId!: number;

    public encodePayload(): void {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.item.networkSerialize(this);
        this.writeByte(this.inventorySlot);
        this.writeByte(this.hotbarSlot);
        this.writeByte(this.windowId);
    }
}
