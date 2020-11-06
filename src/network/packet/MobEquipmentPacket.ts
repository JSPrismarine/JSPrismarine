import type Block from '../../block/Block';
import type Item from '../../item/Item';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class MobEquipmentPacket extends DataPacket {
    static NetID = Identifiers.MobEquipmentPacket;

    public runtimeEntityId: bigint = BigInt(0);
    public item: Item | Block | null = null;
    public inventorySlot: number = 0;
    public hotbarSlot: number = 0;
    public windowId: number = 0;

    public encodePayload() {
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeItemStack(this.item);
        this.writeByte(this.inventorySlot);
        this.writeByte(this.hotbarSlot);
        this.writeByte(this.windowId);
    }
}
