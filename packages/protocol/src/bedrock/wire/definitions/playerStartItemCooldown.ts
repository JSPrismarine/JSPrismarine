/**
 * `PlayerStartItemCooldownPacket`: Starts a cooldown on an item category for the receiving player.
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The `PlayerStartItemCooldownPacket` field list. */
export const playerStartItemCooldownPacket = definePacket('PlayerStartItemCooldownPacket', {
    /**
     * `Item Category`: the cooldown group the item belongs to, for example `ender_pearl`,
     * `chorus_fruit`, `shield` or `goat_horn`. Every item in the group shares the cooldown.
     */
    itemCategory: t.string,
    /** `Duration Ticks`: how long the cooldown runs, in game ticks. */
    durationTicks: t.varint32
});

/** Starts a cooldown on an item category for the receiving player. */
export type PlayerStartItemCooldownPayload = PayloadOf<typeof playerStartItemCooldownPacket>;
