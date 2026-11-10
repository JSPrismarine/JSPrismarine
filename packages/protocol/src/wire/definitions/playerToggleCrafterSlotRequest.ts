/**
 * `PlayerToggleCrafterSlotRequestPacket`: The client enabling or disabling one slot of a crafter
 * block.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-toggle-crafter-slot-request-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `PlayerToggleCrafterSlotRequestPacket` field list. */
export const playerToggleCrafterSlotRequestPacket = definePacket('PlayerToggleCrafterSlotRequestPacket', {
    /** `Pos X`. */
    posX: t.li32,
    /** `Pos Y`. */
    posY: t.li32,
    /** `Pos Z`. */
    posZ: t.li32,
    /** Which of the nine crafter slots, 0 to 8. */
    slotIndex: t.uint8,
    /** `true` to block the slot from receiving items. */
    isDisabled: t.bool
});

/** The client enabling or disabling one slot of a crafter block. */
export type PlayerToggleCrafterSlotRequestPayload = PayloadOf<typeof playerToggleCrafterSlotRequestPacket>;
