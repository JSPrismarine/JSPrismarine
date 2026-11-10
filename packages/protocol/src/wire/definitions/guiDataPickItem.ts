/**
 * `GuiDataPickItemPacket`: Tells the client which hotbar slot to hover over and the two lines to
 * show in the pick-block popup. It is used by pick block, commands, tests, and third-party content.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/gui-data-pick-item-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `GuiDataPickItemPacket` field list. */
export const guiDataPickItemPacket = definePacket('GuiDataPickItemPacket', {
    /** Item Name, the popup title. */
    itemName: t.string,
    /** Item Effect Name, the line beneath the title. */
    itemEffectName: t.string,
    /** Slot to hover, encoded as a little-endian int32. */
    slot: t.li32
});

/** Tells the client which hotbar slot to hover over and the two lines to show in the pick-block popup. */
export type GuiDataPickItemPayload = PayloadOf<typeof guiDataPickItemPacket>;
