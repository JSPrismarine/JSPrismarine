import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Shows the pick block popup and names the hotbar slot it refers to.
 *
 * **Bound To:** Client
 *
 * Only pick block, a few commands, tests and third party content use it. The popup draws
 * Item Name on top of Item Effect Name, in the same place the client draws them when the
 * player selects an item.
 *
 * Protocol 2193 layout (docs id 54), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Item Name | string | The popup's title line |
 * | Item Effect Name | string | The line below it |
 * | Slot | int32 | Little-endian hotbar slot |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/gui-data-pick-item-packet/
 */
export default class GuiDataPickItemPacket extends DataPacket {
    public static NetID = Identifiers.GuiDataPickItemPacket;

    /** Item Name, the title line of the popup. */
    public itemName = '';

    /** Item Effect Name, the line the client usually fills with an item's effects. */
    public itemEffectName = '';

    /** Slot, the hotbar slot to hover. */
    public slot = 0;

    /** Reads the two popup lines and the slot. */
    public decodePayload(): void {
        this.itemName = NetworkUtil.readString(this);
        this.itemEffectName = NetworkUtil.readString(this);
        this.slot = this.readIntLE();
    }

    /** Writes the two popup lines and the slot. */
    public encodePayload(): void {
        NetworkUtil.writeString(this, this.itemName);
        NetworkUtil.writeString(this, this.itemEffectName);
        this.writeIntLE(this.slot);
    }
}
