import type { EvaluateFilterOptions, FilterContext } from '@jsprismarine/entities';
import { evaluateFilter } from '@jsprismarine/entities';
import type { RandomSource } from '@jsprismarine/predicates';

import type { TradeEnchanting, TradeFunctionApplier, TradeFunctionContext, TradeStack } from './functions';
import { VANILLA_TRADE_FUNCTIONS, applyTradeFunctions } from './functions';
import type { TradeDefinition, TradeItem, TradeItemSlot, TradeTable } from './tables';

/**
 * Turning a trade table into the offers one trader shows.
 *
 * The documented rules are the whole of it: "Tiers are unlocked by the trading
 * experience of the villager, not the player. The first tier in a list of
 * trade tiers is always available"; "once the trading system hits a tier that
 * requires more experience points than the trader has, subsequent tiers won't
 * be checked"; and `num_to_select` is "the number of trades from the `trades`
 * array to make available when you trade with a given villager".
 *
 * Every draw goes through an injected {@link RandomSource}, so one seed gives
 * one trader the same offers every time.
 */

/** One generated offer, before demand and the discounts touch its price. */
export interface TradeOffer {
    /** The tier the offer came from, counting from zero. */
    readonly tier: number;
    /** What the offer costs, at the quantity the table drew. */
    readonly wants: readonly TradeStack[];
    readonly gives: readonly TradeStack[];
    /** How much demand raises each want, aligned with {@link wants}. */
    readonly priceMultipliers: readonly number[];
    /** The experience the trader earns per use. */
    readonly traderExp: number;
    readonly maxUses: number;
    readonly rewardExp: boolean;
}

/** What a trader and the player it faces look like to a trade item's filters. */
export interface TradeContext {
    /**
     * The filter context `TradeItem.filters` reads. Vanilla's two uses are
     * `in_overworld` and `is_mark_variant` on `self`, which select the
     * cartographer's maps and the fisherman's fish by the trader's biome
     * variant.
     */
    readonly filters?: FilterContext;
}

/** How to generate one trader's offers. */
export interface OfferGenerationOptions {
    readonly table: TradeTable;
    readonly random: RandomSource;
    /** The trader's experience, which decides how many tiers unlock. Zero for a new trader. */
    readonly traderExp?: number;
    readonly context?: TradeContext;
    readonly enchanting?: TradeEnchanting;
    /** Replaces the six vanilla trade item functions. */
    readonly functions?: ReadonlyMap<string, TradeFunctionApplier>;
    readonly report?: (code: string, message: string) => void;
}

/**
 * How many tiers a trader with this much experience has unlocked.
 *
 * The first tier is always available, and the scan stops at the first tier
 * whose requirement the trader has not met.
 */
export const unlockedTierCount = (table: TradeTable, traderExp: number): number => {
    let unlocked = 0;
    for (const tier of table.tiers) {
        if (unlocked > 0 && traderExp < tier.totalExpRequired) break;
        unlocked += 1;
    }
    return Math.min(unlocked, table.tiers.length);
};

/** Draws an integer in the inclusive range. */
const between = (random: RandomSource, min: number, max: number): number =>
    max <= min ? min : min + random.nextInt(max - min + 1);

/** Draws `count` trades from a group without replacement, in proportion to their weights. */
const selectTrades = (
    trades: readonly TradeDefinition[],
    numToSelect: number,
    random: RandomSource
): readonly TradeDefinition[] => {
    // A negative `num_to_select` offers the whole group, which is how 24 of
    // the 130 vanilla groups and every normalized legacy tier are written.
    if (numToSelect < 0 || numToSelect >= trades.length) return trades;
    if (numToSelect <= 0) return [];

    const pool = [...trades];
    const chosen: TradeDefinition[] = [];
    for (let draw = 0; draw < numToSelect && pool.length > 0; draw += 1) {
        const total = pool.reduce((sum, trade) => sum + Math.max(0, trade.weight), 0);
        let index = pool.length - 1;
        if (total > 0) {
            let roll = random.nextFloat() * total;
            for (let candidate = 0; candidate < pool.length; candidate += 1) {
                roll -= Math.max(0, pool[candidate]!.weight);
                if (roll < 0) {
                    index = candidate;
                    break;
                }
            }
        } else {
            index = random.nextInt(pool.length);
        }
        chosen.push(pool[index]!);
        pool.splice(index, 1);
    }
    return chosen;
};

/**
 * Picks one item from a slot.
 *
 * A `choice` list draws uniformly among the members whose filters pass. When
 * no filter context is supplied, a filtered member is kept and the caller is
 * told once, because a trader with no context should still have offers.
 */
const pickItem = (
    slot: TradeItemSlot,
    options: OfferGenerationOptions,
    filterOptions: EvaluateFilterOptions
): TradeItem | undefined => {
    const context = options.context?.filters;
    const allowed = slot.choices.filter((choice) => {
        if (choice.filters === undefined) return true;
        if (context === undefined) {
            options.report?.('trading.noFilterContext', `a trade item filter on ${choice.item} had no context`);
            return true;
        }
        return evaluateFilter(choice.filters, context, filterOptions);
    });

    if (allowed.length === 0) return undefined;
    return allowed[options.random.nextInt(allowed.length)];
};

/** Resolves one slot into a stack, running its quantity draw and its functions. */
const resolveSlot = (
    slot: TradeItemSlot,
    options: OfferGenerationOptions,
    functionContext: TradeFunctionContext,
    filterOptions: EvaluateFilterOptions
): { readonly stack: TradeStack; readonly priceMultiplier: number; readonly costOverride?: number } | undefined => {
    const item = pickItem(slot, options, filterOptions);
    if (item === undefined) return undefined;

    const base: TradeStack = {
        item: item.item,
        count: between(options.random, item.quantity.min, item.quantity.max),
        components: new Map()
    };
    const outcome = applyTradeFunctions(
        base,
        item.functions,
        functionContext,
        options.functions ?? VANILLA_TRADE_FUNCTIONS
    );

    return outcome.costOverride === undefined
        ? { stack: outcome.stack, priceMultiplier: item.priceMultiplier }
        : { stack: outcome.stack, priceMultiplier: item.priceMultiplier, costOverride: outcome.costOverride };
};

/**
 * Generates the offers of one trader.
 *
 * @returns One offer per selected trade of every unlocked tier, in tier and
 * group order. A trade whose `wants` or `gives` has a slot no choice survives
 * is dropped and reported.
 */
export const generateOffers = (options: OfferGenerationOptions): readonly TradeOffer[] => {
    const traderExp = options.traderExp ?? 0;
    const tiers = unlockedTierCount(options.table, traderExp);

    const functionContext: { -readonly [Key in keyof TradeFunctionContext]: TradeFunctionContext[Key] } = {
        random: options.random
    };
    if (options.enchanting !== undefined) functionContext.enchanting = options.enchanting;
    if (options.report !== undefined) functionContext.report = options.report;

    const filterOptions: EvaluateFilterOptions = {};
    if (options.report !== undefined)
        filterOptions.onUnanswered = (test, reason) =>
            options.report?.('trading.unansweredFilter', `${test.test} went unanswered: ${reason}`);

    const offers: TradeOffer[] = [];
    for (let tier = 0; tier < tiers; tier += 1) {
        for (const group of options.table.tiers[tier]!.groups) {
            for (const trade of selectTrades(group.trades, group.numToSelect, options.random)) {
                const wants = trade.wants.map((slot) => resolveSlot(slot, options, functionContext, filterOptions));
                const gives = trade.gives.map((slot) => resolveSlot(slot, options, functionContext, filterOptions));
                if (wants.includes(undefined) || gives.includes(undefined)) {
                    options.report?.('trading.noChoiceSurvived', 'a trade slot had no choice whose filters passed');
                    continue;
                }

                const resolvedWants = wants.filter((slot) => slot !== undefined);
                const resolvedGives = gives.filter((slot) => slot !== undefined);

                // `enchant_book_for_trading` sits on the `gives` book and
                // prices the trade, so its cost lands on the first want, which
                // is the emerald the librarian's book trade asks for.
                const cost = resolvedGives.find((slot) => slot.costOverride !== undefined)?.costOverride;
                const priced =
                    cost === undefined || resolvedWants.length === 0
                        ? resolvedWants.map((slot) => slot.stack)
                        : resolvedWants.map((slot, index) =>
                              index === 0
                                  ? { item: slot.stack.item, count: cost, components: slot.stack.components }
                                  : slot.stack
                          );

                offers.push({
                    tier,
                    wants: priced,
                    gives: resolvedGives.map((slot) => slot.stack),
                    priceMultipliers: resolvedWants.map((slot) => slot.priceMultiplier),
                    traderExp: trade.traderExp,
                    maxUses: trade.maxUses,
                    rewardExp: trade.rewardExp
                });
            }
        }
    }

    return offers;
};
