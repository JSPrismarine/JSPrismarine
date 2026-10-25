/**
 * What completing an advancement hands the player.
 *
 * The engine declares four hooks and fires each one against the `EntityView`
 * of whoever completed the advancement, which is the only thing it has. This
 * is where that view is turned back into a `Player` - see `subject.ts` for
 * how - and where the two rewards this server can actually pay are paid.
 *
 * Vanilla uses `experience` on 23 of its 1866 files and `recipes` on 1739, and
 * uses neither `loot` nor `function` on any. Of those two, only experience is
 * paid here: there is no recipe book to unlock into, so a recipe reward
 * reports through the engine's own diagnostic rather than being swallowed.
 */
import type { RewardHooks } from '@jsprismarine/advancements';

import { AttributeIds } from '../entity/Attribute';
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

        addExperiencePoints(
            {
                getLevel: () => player.attributes.getValue(AttributeIds.PlayerLevel),
                getProgress: () => player.attributes.getValue(AttributeIds.PlayerExperience),
                setLevel: (level) => player.attributes.setValue(AttributeIds.PlayerLevel, level),
                setProgress: (progress) => player.attributes.setValue(AttributeIds.PlayerExperience, progress)
            },
            amount
        );
    }
});
