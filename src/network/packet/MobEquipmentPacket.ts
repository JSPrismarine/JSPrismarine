import type Block from '../../block/Block';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import type Item from '../../item/Item';

export default class MobEquipmentPacket extends DataPacket {
    static NetID = Identifiers.MobEquipmentPacket;

    public runtimeEntityId!: bigint;
    public item!: Item | Block;
    public inventorySlot!: number;
    public hotbarSlot!: number;
    public windowId!: number;

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeItemStack(this.item);
        this.writeByte(this.inventorySlot);
        this.writeByte(this.hotbarSlot);
        this.writeByte(this.windowId);
    }
}
