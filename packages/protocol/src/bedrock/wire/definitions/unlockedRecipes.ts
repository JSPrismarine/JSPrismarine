/**
 * `UnlockedRecipesPacket`: Changes the set of recipes a player has unlocked.
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';

import type { PayloadOf } from '../../../wire/define';

/** The `UnlockedRecipesPacket` field list. */
export const unlockedRecipesPacket = definePacket('UnlockedRecipesPacket', {
    /** `Type`: how the list changes the unlocked set. */
    type: t.lu32,
    /** `Recipes`: the recipe identifiers. */
    recipes: t.list(t.string)
});

/** Changes the set of recipes a player has unlocked. */
export type UnlockedRecipesPayload = PayloadOf<typeof unlockedRecipesPacket>;
