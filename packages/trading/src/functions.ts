import type { RandomSource } from '@jsprismarine/predicates';

import type { TradeFunctionSpec } from './tables';

/**
 * The loot functions a trade item carries.
 *
 * Vanilla's 27 trade tables use six: `enchant_with_levels`,
 * `exploration_map`, `enchant_book_for_trading`, `random_aux_value`,
 * `set_potion` and `random_dye`. Four of them need nothing but the item and a
 * random source, so they run here. The two enchanting ones need the
 * enchantment tables, which belong to another package, so they reach a
 * {@link TradeEnchanting} seam a caller supplies and this module keeps only
 * the arithmetic: the level draw and the emerald cost formula.
 */

/** One resolved item of an offer. */
export interface TradeStack {
    readonly item: string;
    readonly count: number;
    /** What the item's functions wrote, keyed by the component each one sets. */
    readonly components: ReadonlyMap<string, unknown>;
}

/** The enchantment seam the two enchanting functions reach. */
export interface TradeEnchanting {
    /**
     * Enchants a stack as `enchant_with_levels` asks.
     *
     * @param levels - The enchanting level already drawn from the function's range.
     * @returns The components to write, or undefined when the item takes no enchantment.
     */
    enchantWithLevels?(
        item: string,
        levels: number,
        treasure: boolean,
        random: RandomSource
    ): ReadonlyMap<string, unknown> | undefined;
    /**
     * Picks the single enchantment a traded book carries.
     *
     * @returns The enchantment's level, which drives the emerald cost, and the
     * components to write.
     */
    enchantBookForTrading?(
        item: string,
        random: RandomSource
    ): { readonly level: number; readonly components: ReadonlyMap<string, unknown> } | undefined;
}

/** What one function did to a stack. */
export interface TradeFunctionOutcome {
    readonly stack: TradeStack;
    /**
     * An emerald cost the function sets on the trade. `enchant_book_for_trading`
     * is the one vanilla function that does, because the price of an enchanted
     * book follows the enchantment it drew.
     */
    readonly costOverride?: number;
}

/** Everything a function needs beyond the stack and its own body. */
export interface TradeFunctionContext {
    readonly random: RandomSource;
    readonly enchanting?: TradeEnchanting;
    /** Receives a function the registry does not hold and a seam the caller did not supply. */
    readonly report?: (code: string, message: string) => void;
}

/** Applies one function to a stack. */
export type TradeFunctionApplier = (
    stack: TradeStack,
    spec: TradeFunctionSpec,
    context: TradeFunctionContext
) => TradeFunctionOutcome;

const numberAt = (source: Readonly<Record<string, unknown>>, key: string, fallback: number): number => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

/** Reads a `{min, max}` body or a bare number, which is how the function ranges are written. */
const rangeAt = (
    source: Readonly<Record<string, unknown>>,
    key: string,
    fallback: { min: number; max: number }
): { min: number; max: number } => {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return { min: value, max: value };
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const body: Readonly<Record<string, unknown>> = value as Readonly<Record<string, unknown>>;
        return { min: numberAt(body, 'min', fallback.min), max: numberAt(body, 'max', fallback.max) };
    }
    return fallback;
};

/** Draws an integer in the inclusive range. */
const between = (random: RandomSource, min: number, max: number): number =>
    max <= min ? min : min + random.nextInt(max - min + 1);

const withComponent = (stack: TradeStack, key: string, value: unknown): TradeStack => {
    const components = new Map(stack.components);
    components.set(key, value);
    return { item: stack.item, count: stack.count, components };
};

const withComponents = (stack: TradeStack, added: ReadonlyMap<string, unknown>): TradeStack => {
    const components = new Map(stack.components);
    for (const [key, value] of added) components.set(key, value);
    return { item: stack.item, count: stack.count, components };
};

/** The 16 dye indices `random_dye` draws from, which is the vanilla dye palette's size. */
export const DYE_COLOR_COUNT = 16;

const enchantWithLevels: TradeFunctionApplier = (stack, spec, context) => {
    const range = rangeAt(spec.body, 'levels', { min: 1, max: 1 });
    const levels = between(context.random, range.min, range.max);
    const treasure = spec.body.treasure === true;
    const added = context.enchanting?.enchantWithLevels?.(stack.item, levels, treasure, context.random);
    if (added === undefined) {
        context.report?.('trading.noEnchanter', 'enchant_with_levels needs a TradeEnchanting seam');
        return { stack: withComponent(stack, 'trading:enchant_with_levels', { levels, treasure }) };
    }
    return { stack: withComponents(stack, added) };
};

/**
 * `enchant_book_for_trading`. The four parameters are the cost formula:
 * `base_cost + random(0, base_random_cost + level * per_level_random_cost) +
 * level * per_level_cost`, and the result becomes the trade's emerald price.
 */
const enchantBookForTrading: TradeFunctionApplier = (stack, spec, context) => {
    const drawn = context.enchanting?.enchantBookForTrading?.(stack.item, context.random);
    if (drawn === undefined)
        context.report?.('trading.noEnchanter', 'enchant_book_for_trading needs a TradeEnchanting seam');

    const level = drawn?.level ?? 0;
    const baseCost = numberAt(spec.body, 'base_cost', 0);
    const baseRandomCost = numberAt(spec.body, 'base_random_cost', 0);
    const perLevelRandomCost = numberAt(spec.body, 'per_level_random_cost', 0);
    const perLevelCost = numberAt(spec.body, 'per_level_cost', 0);

    const randomSpan = Math.max(0, Math.floor(baseRandomCost + level * perLevelRandomCost));
    const cost = baseCost + context.random.nextInt(randomSpan + 1) + level * perLevelCost;

    const enchanted = drawn === undefined ? stack : withComponents(stack, drawn.components);
    return { stack: enchanted, costOverride: Math.max(1, Math.round(cost)) };
};

const explorationMap: TradeFunctionApplier = (stack, spec) => ({
    stack: withComponent(stack, 'minecraft:exploration_map', spec.body.destination)
});

const setPotion: TradeFunctionApplier = (stack, spec) => ({
    stack: withComponent(stack, 'minecraft:potion', spec.body.id)
});

const randomDye: TradeFunctionApplier = (stack, _spec, context) => ({
    stack: withComponent(stack, 'minecraft:dye_color', context.random.nextInt(DYE_COLOR_COUNT))
});

const randomAuxValue: TradeFunctionApplier = (stack, spec, context) => {
    const range = rangeAt(spec.body, 'values', { min: 0, max: 0 });
    return { stack: withComponent(stack, 'minecraft:aux_value', between(context.random, range.min, range.max)) };
};

/** The six functions vanilla's trade tables use. */
export const VANILLA_TRADE_FUNCTIONS: ReadonlyMap<string, TradeFunctionApplier> = new Map([
    ['enchant_with_levels', enchantWithLevels],
    ['enchant_book_for_trading', enchantBookForTrading],
    ['exploration_map', explorationMap],
    ['set_potion', setPotion],
    ['random_dye', randomDye],
    ['random_aux_value', randomAuxValue]
]);

/**
 * Runs every function of one item in order.
 *
 * @returns The stack with each function's components, and the last cost any of
 * them set.
 */
export const applyTradeFunctions = (
    stack: TradeStack,
    specs: readonly TradeFunctionSpec[],
    context: TradeFunctionContext,
    registry: ReadonlyMap<string, TradeFunctionApplier> = VANILLA_TRADE_FUNCTIONS
): TradeFunctionOutcome => {
    let current = stack;
    let costOverride: number | undefined;

    for (const spec of specs) {
        const applier = registry.get(spec.name);
        if (applier === undefined) {
            context.report?.('trading.unknownFunction', `unknown trade item function ${spec.name}`);
            continue;
        }
        const outcome = applier(current, spec, context);
        current = outcome.stack;
        if (outcome.costOverride !== undefined) costOverride = outcome.costOverride;
    }

    return costOverride === undefined ? { stack: current } : { stack: current, costOverride };
};
