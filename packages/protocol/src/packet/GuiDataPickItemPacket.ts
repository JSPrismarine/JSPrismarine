import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The text shown in the pick-block popup and the hotbar slot it points to. */
export interface GuiDataPickItem {
    /** Item Name, the popup title. */
    itemName: string;
    /** Item Effect Name, the line beneath the title. */
    itemEffectName: string;
    /** Slot to hover, encoded as a little-endian int32. */
    slot: number;
}

/**
 * Tells the client which hotbar slot to hover over and the two lines to show in the pick-block
 * popup. It is used by pick block, commands, tests, and third-party content.
 *
 * Protocol 2193 layout: `Item Name` as a string, `Item Effect Name` as a string, then `Slot`
 * as a little-endian int32.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/gui-data-pick-item-packet/
 */
export default class GuiDataPickItemPacket extends NetworkPacket<GuiDataPickItem> {
    public get id(): number {
        return PacketIdentifier.GUI_DATA_PICK_ITEM;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: GuiDataPickItem): void {
        stream.writeString(data.itemName);
        stream.writeString(data.itemEffectName);
        stream.writeIntLE(data.slot);
    }

    protected deserializePayload(stream: NetworkBinaryStream): GuiDataPickItem {
        return {
            itemName: stream.readString(),
            itemEffectName: stream.readString(),
            slot: stream.readIntLE()
        };
    }
}
