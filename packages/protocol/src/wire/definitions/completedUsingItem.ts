/**
 * `CompletedUsingItemPacket`: The end of a use that takes time, such as finishing a drink or a
 * meal.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/completed-using-item-packet/}
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** The `CompletedUsingItemPacket` field list. */
export const completedUsingItemPacket = definePacket('CompletedUsingItemPacket', {
    /** Item Id: the network id of the item that finished being used. */
    itemId: t.li16,
    /** Item Use Method: which kind of use completed. */
    itemUseMethod: t.li32
});

/** The end of a use that takes time, such as finishing a drink or a meal. */
export type CompletedUsingItemPayload = PayloadOf<typeof completedUsingItemPacket>;
