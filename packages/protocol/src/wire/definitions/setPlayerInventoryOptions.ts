/**
 * `SetPlayerInventoryOptionsPacket`: How the player has arranged their inventory screen.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-player-inventory-options-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `SetPlayerInventoryOptionsPacket` field list. */
export const setPlayerInventoryOptionsPacket = definePacket('SetPlayerInventoryOptionsPacket', {
    /** Left Inventory Tab: the recipe book tab that is open. */
    leftTab: t.varint32,
    /** Right Inventory Tab: the inventory side tab that is open. */
    rightTab: t.varint32,
    /** Filtering: whether the recipe book hides recipes the player cannot craft. */
    filtering: t.bool,
    /** Layout Inv: the layout of the inventory screen. */
    inventoryLayout: t.varint32,
    /** Layout Craft: the layout of the crafting table screen. */
    craftingLayout: t.varint32
});

/** How the player has arranged their inventory screen. */
export type SetPlayerInventoryOptionsPayload = PayloadOf<typeof setPlayerInventoryOptionsPacket>;
