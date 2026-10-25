/**
 * The anvil: what two stacks and a typed name make, and what it costs.
 *
 * `combineInAnvil` in `@jsprismarine/enchantments` is `AnvilMenu.createResult`
 * step for step and deliberately changes nothing: it will not consume items,
 * will not spend experience, and leaves whether the player can pay to the
 * caller. This module is that caller - it converts the server's stacks into
 * the shape the rule takes, charges the levels, and hands back what the player
 * gets.
 *
 * The prior work penalty rides on the result rather than on the player, as
 * `minecraft:repair_cost`, which is what makes the fourth or fifth
 * combination of one item unaffordable.
 */
import { combineInAnvil } from '@jsprismarine/enchantments';
import type { AnvilResult, EnchantmentRegistry } from '@jsprismarine/enchantments';
import { enchantmentsOf } from '@jsprismarine/enchantments';
import type { ItemStack as PredicateItemStack } from '@jsprismarine/predicates';

import type Player from '../Player';
import { AttributeIds } from '../entity/Attribute';
import { spendExperienceLevels } from '../entity/Experience';
import type { Item } from '../item/Item';

/** Levels at or above which the anvil refuses, unless the player has unlimited materials. */
export const ANVIL_LEVEL_CEILING = 40;

/** What the anvil would make of two stacks, without changing anything. */
export interface AnvilPreview extends AnvilResult {
    /** The result as this server's stacks, or undefined when the anvil refuses. */
    readonly stack: Item | undefined;
}

/** What the anvil was given. */
export interface AnvilAttempt {
    /** Left slot: the item being worked on. */
    readonly base: Item;
    /** Right slot: a repair material, a second copy, or an enchanted book. */
    readonly addition?: Item;
    /** The name the player typed, or undefined when the field was not touched. */
    readonly name?: string;
    /** Bookshelf-free, but creative still ignores the ceiling. */
    readonly unlimitedMaterials?: boolean;
}

/** Rebuilds one of this server's stacks from the record the rule produced. */
const stackOf = (base: Item, output: PredicateItemStack | undefined): Item | undefined => {
    if (output === undefined) return undefined;

    // The name the player typed, which the rule writes as `minecraft:custom_name`. An absent
    // component is a name the anvil removed, which is what clearing the field does.
    const named = output.components.get('minecraft:custom_name');
    const result = base
        .withEnchantments(enchantmentsOf(output))
        .withDisplay(typeof named === 'string' ? named : undefined);
    result.count = output.count;

    const limit = result.getMaxDurability();
    const damage = output.components.get('minecraft:damage');
    if (limit > 0 && typeof damage === 'number') result.durability = Math.max(0, limit - damage);

    return result;
};

/**
 * What the anvil would produce for one attempt.
 *
 * Nothing changes here: the preview is what the client's own anvil screen
 * would show if it could be trusted to compute it, and it cannot be whenever a
 * server-side enchantment is involved, so the server sends the answer.
 */
export const anvilPreview = (registry: EnchantmentRegistry, attempt: AnvilAttempt): AnvilPreview => {
    const result = combineInAnvil(
        registry,
        {
            base: attempt.base.asPredicateStack(),
            ...(attempt.addition === undefined ? {} : { addition: attempt.addition.asPredicateStack() }),
            ...(attempt.name === undefined ? {} : { name: attempt.name })
        },
        { unlimitedMaterials: attempt.unlimitedMaterials ?? false }
    );

    return { ...result, stack: stackOf(attempt.base, result.output) };
};

/** What a completed anvil use produced. */
export interface AnvilOutcome {
    readonly stack: Item;
    /** Experience levels actually spent. */
    readonly cost: number;
    /** How many of the right stack a material repair consumed. */
    readonly materialCost: number;
}

/**
 * Takes the anvil's result and charges for it.
 *
 * @returns Undefined when the anvil refuses the combination, when the cost is
 *   at the ceiling, or when the player cannot pay. Nothing is spent in any of
 *   those cases.
 */
export const takeFromAnvil = (
    registry: EnchantmentRegistry,
    player: Player,
    attempt: AnvilAttempt
): AnvilOutcome | undefined => {
    const preview = anvilPreview(registry, attempt);
    if (!preview.stack) return undefined;

    const unlimited = attempt.unlimitedMaterials ?? false;
    // A pure rename is the exception vanilla makes: it caps at 39 rather than
    // being refused, and it does not raise the prior work penalty.
    if (!unlimited && preview.cost >= ANVIL_LEVEL_CEILING && !preview.onlyRenaming) return undefined;

    const holder = {
        getLevel: () => player.attributes.getValue(AttributeIds.PlayerLevel),
        getProgress: () => player.attributes.getValue(AttributeIds.PlayerExperience),
        setLevel: (level: number) => player.attributes.setValue(AttributeIds.PlayerLevel, level),
        setProgress: (progress: number) => player.attributes.setValue(AttributeIds.PlayerExperience, progress)
    };
    if (!unlimited && preview.cost > 0 && !spendExperienceLevels(holder, preview.cost)) return undefined;

    return { stack: preview.stack, cost: preview.cost, materialCost: preview.materialCost };
};
