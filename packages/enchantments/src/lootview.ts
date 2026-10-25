import type { EnchantmentView, ItemStack, RandomSource } from '@jsprismarine/predicates';

import { enchantmentsOf } from './item';
import type { EnchantmentRegistry } from './registry';
import { selectEnchantments } from './table';

/** The tag `enchant_randomly` draws from when a loot entry names no options. */
export const ON_RANDOM_LOOT_TAG = 'minecraft:on_random_loot';

/** What the loot seam needs beyond the registry itself. */
export interface EnchantmentViewOptions {
    /**
     * Randomness for the enchanting table draw `enchant_with_levels` runs.
     * Leave it out and that one member is omitted, so the loot function
     * reports instead of drawing from an unseeded generator.
     */
    readonly random?: RandomSource;
    /** Tag the random loot draw picks from; defaults to {@link ON_RANDOM_LOOT_TAG}. */
    readonly randomLootTag?: string;
}

/**
 * The adapter for the `EnchantmentView` seam that `@jsprismarine/predicates`
 * declares.
 *
 * This is the piece `fortune` and `looting` need. Neither carries a value
 * effect for its drop bonus: `fortune` has no `effects` at all, and the block
 * loot tables name `minecraft:fortune` directly in 32 `apply_bonus` calls and
 * 35 `table_bonus` conditions. Those loot functions already own the bonus
 * arithmetic; all they lack is the level on the tool, which `levelOn` answers.
 * Nothing here repeats the formulas.
 *
 * @returns A view a host passes to `new PredicateContext({ enchantments })`.
 */
export const createEnchantmentView = (
    registry: EnchantmentRegistry,
    options: EnchantmentViewOptions = {}
): EnchantmentView => {
    const randomLoot = registry.membersOf(options.randomLootTag ?? ON_RANDOM_LOOT_TAG);

    const view: EnchantmentView = {
        levelOn: (stack, enchantment) => enchantmentsOf(stack).get(enchantment) ?? 0,
        maxLevel: (enchantment) => registry.maxLevelOf(enchantment),
        applicableTo: (stack) => {
            const supported = registry.applicableTo(stack);
            if (randomLoot.size === 0) return supported;
            return supported.filter((enchantment) => randomLoot.has(enchantment));
        }
    };

    const random = options.random;
    if (random === undefined) return view;

    return {
        ...view,
        selectRandomEnchantments: (stack: ItemStack, levels: number, candidates: readonly string[] | undefined) =>
            new Map(
                selectEnchantments(registry, random, stack, levels, candidates).map((pick) => [
                    pick.enchantment,
                    pick.level
                ])
            )
    };
};
