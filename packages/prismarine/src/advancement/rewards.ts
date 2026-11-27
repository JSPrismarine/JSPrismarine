/**
 * What completing an advancement hands the player.
 *
 * The engine declares four hooks and fires each one against the `EntityView`
 * of whoever completed the advancement, which is the only thing it has. This
 * is where that view is turned back into the player - see `subject.ts` for
 * how - and where the two rewards this server can actually pay are paid.
 *
 * Vanilla uses `experience` on 23 of its 1866 files and `recipes` on 1739, and
 * uses neither `loot` nor `function` on any. Both of those two are paid here:
 * experience into the player's bar, and recipes into the player's recipe book.
 */
import type { RewardHooks } from '@jsprismarine/advancements';

import { isLearnableRecipe, unlockRecipes } from '../crafting/recipeBook';
import { addExperiencePoints } from '../entity/Experience';
import { playerOfSubject } from './subject';

/**
 * The hooks the engine is built with.
 *
 * Built as a value rather than inlined so the composition root names one
 * thing, and so the set of rewards this server pays is readable in one place.
 */
export const advancementRewards = (): RewardHooks => ({
    grantExperience: (subject, amount) => {
        const player = playerOfSubject(subject);
        if (!player) return;

        addExperiencePoints(player.getExperience(), amount);
    },
    /**
     * Unlocks the recipe, skipping one the content has no recipe for, as Java's lookup by key
     * does, and one the book cannot hold.
     * @javaSee ServerPlayer.awardRecipesByKey
     */
    unlockRecipe: (subject, recipe) => {
        const player = playerOfSubject(subject);
        if (!player) return;

        const known = player.getServer().getContent().recipes.get(recipe);
        if (known === undefined || !isLearnableRecipe(known)) return;
        unlockRecipes(player, [recipe]);
    }
});
