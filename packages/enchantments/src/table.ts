import type { ItemStack, RandomSource } from '@jsprismarine/predicates';

import { MIN_ENCHANTMENT_LEVEL, costAt } from './definition';
import { javaRandom } from './random';
import type { EnchantmentRegistry } from './registry';

/** One enchantment at one level, which is what a draw returns. */
export interface EnchantmentInstance {
    /** Namespaced enchantment id. */
    readonly enchantment: string;
    readonly level: number;
}

/** One of the three rows an enchanting table shows. */
export interface EnchantingOffer {
    /** Experience levels the row costs, or 0 when the row is empty. */
    readonly cost: number;
    /** The single enchantment the client shows as a hint, or undefined when the row is empty. */
    readonly clue: EnchantmentInstance | undefined;
}

/** Bookshelves past this many around a table change nothing. */
export const MAX_BOOKSHELF_POWER = 15;

/** An enchanting table always shows three rows. */
export const ENCHANTING_SLOTS = 3;

/** The tag the enchanting table draws from when a caller names no candidates. */
export const IN_ENCHANTING_TABLE_TAG = 'minecraft:in_enchanting_table';

/** A book takes any enchantment in the table's pool, not only the ones that support it. */
export const BOOK_ITEM = 'minecraft:book';

/**
 * The experience level one row of the enchanting table costs.
 *
 * Java's formula, from `EnchantmentHelper.getEnchantmentCost` in the 26.3
 * server jar: a base of `nextInt(8) + 1 + power / 2 + nextInt(power + 1)`,
 * then a third of it in the top row, two thirds plus one in the middle, and
 * the larger of the base and twice the power in the bottom.
 *
 * @param slot - Row index, 0 for the cheapest.
 * @param bookshelfPower - Bookshelves around the table, clamped to {@link MAX_BOOKSHELF_POWER}.
 */
export const enchantmentCost = (random: RandomSource, slot: number, bookshelfPower: number): number => {
    const power = Math.min(bookshelfPower, MAX_BOOKSHELF_POWER);
    const base = random.nextInt(8) + 1 + (power >> 1) + random.nextInt(power + 1);

    if (slot === 0) return Math.max(Math.trunc(base / 3), 1);
    if (slot === 1) return Math.trunc((base * 2) / 3) + 1;
    return Math.max(base, power * 2);
};

const weightedPick = (
    random: RandomSource,
    options: readonly EnchantmentInstance[],
    registry: EnchantmentRegistry
): EnchantmentInstance | undefined => {
    const total = options.reduce((sum, option) => sum + (registry.get(option.enchantment)?.weight ?? 0), 0);
    if (total <= 0) return undefined;

    let roll = random.nextInt(total);
    for (const option of options) {
        roll -= registry.get(option.enchantment)?.weight ?? 0;
        if (roll < 0) return option;
    }
    return undefined;
};

const candidatesOf = (registry: EnchantmentRegistry, candidates: readonly string[] | undefined): readonly string[] =>
    candidates ?? [...registry.membersOf(IN_ENCHANTING_TABLE_TAG)];

/**
 * Every enchantment and level a draw at `level` could produce for a stack.
 *
 * One entry per enchantment at most: Java walks a candidate's levels downward
 * and keeps the first whose cost window contains `level`, so a draw never
 * offers a weaker level than it could.
 *
 * @param level - The modified enchantment level, after the table widened the row cost.
 */
export const availableEnchantments = (
    registry: EnchantmentRegistry,
    stack: ItemStack,
    level: number,
    candidates?: readonly string[]
): readonly EnchantmentInstance[] => {
    const isBook = stack.id === BOOK_ITEM;

    return candidatesOf(registry, candidates).flatMap((enchantment) => {
        const definition = registry.get(enchantment);
        if (definition === undefined) return [];
        if (!isBook && !registry.isPrimary(stack, enchantment)) return [];

        for (let offered = definition.maxLevel; offered >= MIN_ENCHANTMENT_LEVEL; offered -= 1) {
            if (level >= costAt(definition.minCost, offered) && level <= costAt(definition.maxCost, offered)) {
                return [{ enchantment: definition.id, level: offered }];
            }
        }
        return [];
    });
};

/**
 * Draws the enchantments one row of the table grants.
 *
 * Java's `EnchantmentHelper.selectEnchantment`, verbatim: widen the row cost
 * by the item's enchantability, nudge it by up to 15 percent either way, pick
 * one candidate by weight, then keep halving the level and picking again while
 * `nextInt(50)` stays at or below it, dropping candidates that conflict with
 * the last pick.
 *
 * @param level - The row's experience cost.
 * @returns The picks in the order they were drawn, which is the order their conflicts were resolved.
 */
export const selectEnchantments = (
    registry: EnchantmentRegistry,
    random: RandomSource,
    stack: ItemStack,
    level: number,
    candidates?: readonly string[]
): readonly EnchantmentInstance[] => {
    const enchantability = registry.items.enchantmentValue?.(stack) ?? 0;
    if (enchantability <= 0) return [];

    const spread = Math.trunc(enchantability / 4) + 1;
    let modified = level + 1 + random.nextInt(spread) + random.nextInt(spread);

    const nudge = Math.fround(Math.fround(Math.fround(random.nextFloat() + random.nextFloat()) - 1) * 0.15);
    modified = Math.max(1, Math.round(Math.fround(modified + Math.fround(modified * nudge))));

    let options = [...availableEnchantments(registry, stack, modified, candidates)];
    const picked: EnchantmentInstance[] = [];
    if (options.length === 0) return picked;

    const first = weightedPick(random, options, registry);
    if (first !== undefined) picked.push(first);

    while (random.nextInt(50) <= modified) {
        const last = picked.at(-1);
        if (last !== undefined) {
            options = options.filter((option) => registry.areCompatible(last.enchantment, option.enchantment));
        }
        if (options.length === 0) break;

        const next = weightedPick(random, options, registry);
        if (next !== undefined) picked.push(next);
        modified = Math.trunc(modified / 2);
    }
    return picked;
};

/** What an enchanting table needs to know before it can show a stack's rows. */
export interface EnchantingTableOptions {
    /** The player's enchantment seed, which vanilla rerolls after every use. */
    readonly seed: number;
    /** Bookshelves around the table. */
    readonly bookshelfPower: number;
    /** Enchantments the table may draw, defaulting to the `in_enchanting_table` tag. */
    readonly candidates?: readonly string[];
}

/**
 * The three rows an enchanting table shows for a stack.
 *
 * One `java.util.Random` drives the whole thing, seeded with the player's
 * enchantment seed for the costs and reseeded with `seed + row` for each row's
 * draw, which is why the rows are stable until the player enchants something.
 * A row whose cost is below its own index shows nothing, and so does a stack
 * the table cannot enchant.
 *
 * @returns Exactly {@link ENCHANTING_SLOTS} rows, cheapest first.
 */
export const enchantingOffers = (
    registry: EnchantmentRegistry,
    stack: ItemStack,
    options: EnchantingTableOptions
): readonly EnchantingOffer[] => {
    const empty: readonly EnchantingOffer[] = Array.from({ length: ENCHANTING_SLOTS }, () => ({
        cost: 0,
        clue: undefined
    }));
    if (stack.count !== 1 || (registry.items.enchantmentValue?.(stack) ?? 0) <= 0) return empty;

    const random = javaRandom(options.seed);
    const costs = Array.from({ length: ENCHANTING_SLOTS }, (_row, slot) => {
        const cost = enchantmentCost(random, slot, options.bookshelfPower);
        return cost < slot + 1 ? 0 : cost;
    });

    return costs.map((cost, slot) => {
        if (cost <= 0) return { cost: 0, clue: undefined };

        random.setSeed(options.seed + slot);
        const drawn = [...selectEnchantments(registry, random, stack, cost, options.candidates)];
        if (stack.id === BOOK_ITEM && drawn.length > 1) drawn.splice(random.nextInt(drawn.length), 1);
        if (drawn.length === 0) return { cost, clue: undefined };

        return { cost, clue: drawn[random.nextInt(drawn.length)] };
    });
};
