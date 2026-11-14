/**
 * `BlockPickRequestPacket`: the position and hotbar state the client sends when it picks a block.
 *
 * Layout at protocols 2193 and 2225, which agree: `Position` as a `BlockPos`, `With Data?` as a boolean, then `Max Slots`
 * as a uint8.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/block-pick-request-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The fields the client sends when it picks the block it is looking at. */
export const blockPickRequestPacket = definePacket('BlockPickRequestPacket', {
    /** `Position`: the block to pick, as three ZigZag varints. */
    position: t.blockPos,
    /** `With Data?`: whether the picked item should include the block's data. */
    withData: t.bool,
    /** `Max Slots`: the empty hotbar slots available to receive the picked item. */
    maxSlots: t.uint8
});

/** Payload carried by `BlockPickRequestPacket`. */
export type BlockPickRequestPayload = PayloadOf<typeof blockPickRequestPacket>;
