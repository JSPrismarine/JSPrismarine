/**
 * Java Edition's villager trades: the `villager_trade` and `trade_set` registries, drawn the way
 * Java 26.3 draws them.
 *
 * A villager's level names one trade set (`minecraft:<profession>/level_<n>`), and a wandering
 * trader draws three sets into its one tier. `AbstractVillager.addOffersFromTradeSet` takes the
 * set's `amount` of offers from the trades its `trades` holder set names: without duplicates it
 * removes a random trade from the pool and keeps the offer it makes, until it has `amount` or the
 * pool is empty, and with them it leaves the trade in the pool and removes only one that made no
 * offer. `VillagerTrade.getOffer` makes the offer, or none when its `merchant_predicate` fails,
 * its `given_item_modifier` empties the stack, or a price comes to less than one.
 *
 * The Java grammar a trade carries, its predicate and its item modifier, is the host's to
 * evaluate: this package parses and draws, and a {@link JavaTradeSession} answers for the
 * grammar, the item limits and the Bedrock item each Java stack stands for.
 */
import type { RandomSource } from '@jsprismarine/predicates';

import type { TradeStack } from './functions';
import { isRecord } from './isRecord';
import type { OfferSource, TradeOffer } from './offers';

/** The experience each villager level needs, Java's `VillagerData.NEXT_LEVEL_XP_THRESHOLDS`. */
export const JAVA_VILLAGER_LEVEL_EXPERIENCE: readonly number[] = [0, 10, 70, 150, 250];

/**
 * The sets a wandering trader draws into its one tier, in the order
 * `WanderingTrader.updateTrades` draws them.
 */
export const JAVA_WANDERING_TRADER_SETS: readonly string[] = [
    'minecraft:wandering_trader/buying',
    'minecraft:wandering_trader/uncommon',
    'minecraft:wandering_trader/common'
];

/**
 * The trade sets of each tier of a villager of a profession, `minecraft:<profession>/level_<n>`
 * as `VillagerProfession.getTrades` names them.
 *
 * @param profession - Java's profession name, such as `librarian` or `mason`.
 */
export const javaVillagerTradeSets = (profession: string): readonly (readonly string[])[] =>
    JAVA_VILLAGER_LEVEL_EXPERIENCE.map((_required, level) => [`minecraft:${profession}/level_${level + 1}`]);

/** The component a trade's enchanting modifier adds to its price, Java's `ADDITIONAL_TRADE_COST`. */
const ADDITIONAL_TRADE_COST = 'minecraft:additional_trade_cost';

/** A stack a trade names: Java's item, how many, and the components it carries or must carry. */
export interface JavaTradeStack {
    readonly id: string;
    readonly count: number;
    /** The `components` field, in Java's component types. */
    readonly components: Readonly<Record<string, unknown>>;
}

/** One `villager_trade` entry. */
export interface JavaVillagerTrade {
    readonly wants: JavaTradeStack;
    readonly additionalWants?: JavaTradeStack;
    readonly gives: JavaTradeStack;
    readonly maxUses: number;
    readonly xp: number;
    /** How much demand and reputation move the price, `MerchantOffer.priceMultiplier`. */
    readonly reputationDiscount: number;
    /** The `merchant_predicate` condition, for the host to compile. */
    readonly merchantPredicate?: unknown;
    /** The `given_item_modifier`, for the host to compile. */
    readonly givenItemModifier?: unknown;
    /** The `double_trade_price_enchantments` holder set, for the host to resolve. */
    readonly doubleTradePriceEnchantments?: unknown;
}

/** One `trade_set` entry. */
export interface JavaTradeSet {
    /** The `trades` holder set of `villager_trade` ids, for the host to resolve. */
    readonly trades: unknown;
    readonly amount: number;
    readonly allowDuplicates: boolean;
    readonly randomSequence?: string;
}

/** A whole number field, or `fallback` when the field is absent; undefined when it is something else. */
const wholeAt = (value: Record<string, unknown>, key: string, fallback?: number): number | undefined => {
    const held = value[key];
    if (held === undefined) return fallback;
    return typeof held === 'number' && Number.isInteger(held) ? held : undefined;
};

const stackIn = (value: unknown, fallbackCount: number): JavaTradeStack | undefined => {
    if (!isRecord(value) || typeof value.id !== 'string') return undefined;
    const count = wholeAt(value, 'count', fallbackCount);
    if (count === undefined) return undefined;
    const components = value.components;
    if (components !== undefined && !isRecord(components)) return undefined;
    return { id: value.id, count, components: components ?? {} };
};

/**
 * Reads a `villager_trade` entry with the defaults Java's codec gives: `max_uses` 4, `xp` 1 and
 * `reputation_discount` 0, and a count of 1.
 *
 * Every count, use limit and experience vanilla writes is a whole number; a pack that writes a
 * number provider instead is not read.
 *
 * @returns The trade, or undefined when a field this needs is missing or the wrong shape.
 */
export const parseJavaVillagerTrade = (value: unknown): JavaVillagerTrade | undefined => {
    if (!isRecord(value)) return undefined;
    const wants = stackIn(value.wants, 1);
    const gives = stackIn(value.gives, 1);
    const additionalWants = value.additional_wants === undefined ? undefined : stackIn(value.additional_wants, 1);
    const maxUses = wholeAt(value, 'max_uses', 4);
    const xp = wholeAt(value, 'xp', 1);
    const discount = value.reputation_discount ?? 0;
    if (wants === undefined || gives === undefined || maxUses === undefined || xp === undefined) return undefined;
    if (value.additional_wants !== undefined && additionalWants === undefined) return undefined;
    if (typeof discount !== 'number') return undefined;
    return {
        wants,
        gives,
        maxUses,
        xp,
        reputationDiscount: discount,
        ...(additionalWants === undefined ? {} : { additionalWants }),
        ...(value.merchant_predicate === undefined ? {} : { merchantPredicate: value.merchant_predicate }),
        ...(value.given_item_modifier === undefined ? {} : { givenItemModifier: value.given_item_modifier }),
        ...(value.double_trade_price_enchantments === undefined
            ? {}
            : { doubleTradePriceEnchantments: value.double_trade_price_enchantments })
    };
};

/**
 * Reads a `trade_set` entry, with `allow_duplicates` false when it is absent.
 *
 * @returns The set, or undefined when `trades` or a whole `amount` is missing.
 */
export const parseJavaTradeSet = (value: unknown): JavaTradeSet | undefined => {
    if (!isRecord(value) || value.trades === undefined) return undefined;
    const amount = wholeAt(value, 'amount');
    const allowDuplicates = value.allow_duplicates ?? false;
    if (amount === undefined || typeof allowDuplicates !== 'boolean') return undefined;
    if (value.random_sequence !== undefined && typeof value.random_sequence !== 'string') return undefined;
    return {
        trades: value.trades,
        amount,
        allowDuplicates,
        ...(typeof value.random_sequence === 'string' ? { randomSequence: value.random_sequence } : {})
    };
};

/** What one draw from a trade set reads, which the host builds per set. */
export interface JavaTradeSession {
    /** The set's random stream, which every draw and modifier takes from. */
    readonly random: RandomSource;
    /** Whether the trade's `merchant_predicate` holds for this trader; true when it has none. */
    accepts(id: string, trade: JavaVillagerTrade): boolean;
    /**
     * The trade's `gives` after its `given_item_modifier`, components in Java's types, or
     * undefined when the modifier discarded it.
     */
    given(id: string, trade: JavaVillagerTrade): JavaTradeStack | undefined;
    /** Whether an enchantment is one the trade's `double_trade_price_enchantments` names. */
    doublesPrice(id: string, trade: JavaVillagerTrade, enchantment: string): boolean;
    /** How many of a Java item one stack holds, which caps a price. */
    maxStackSize(item: string): number;
    /** The Bedrock stack a Java stack is offered as. */
    tradeStackOf(stack: JavaTradeStack): TradeStack;
}

/** The registries and the grammar a Java trade draw needs from the host. */
export interface JavaTradeHost {
    /** The `trade_set` entry with this id. */
    tradeSet(id: string): JavaTradeSet | undefined;
    /** The `villager_trade` ids a set's `trades` names, in the holder set's order. */
    tradesOf(set: JavaTradeSet): readonly string[];
    /** The `villager_trade` entry with this id. */
    trade(id: string): JavaVillagerTrade | undefined;
    /** A session for one draw from a set, on the set's `random_sequence`. */
    session(set: JavaTradeSet): JavaTradeSession;
    /** Receives a set or a trade the registries do not hold. */
    report?(code: string, message: string): void;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** The enchantment ids of a `stored_enchantments` component, wrapped in `levels` or bare. */
const storedEnchantmentsOf = (stack: JavaTradeStack): readonly string[] => {
    const held = stack.components['minecraft:stored_enchantments'];
    if (!isRecord(held)) return [];
    const levels = isRecord(held.levels) ? held.levels : held;
    return Object.keys(levels);
};

/**
 * One offer from one trade, Java's `VillagerTrade.getOffer`.
 *
 * The additional trade cost an enchanting modifier wrote comes off the stack and onto the first
 * want, doubled when the stack stores an enchantment `double_trade_price_enchantments` names, and
 * the want is held to the item's stack size. Only the first want moves with demand and reputation.
 *
 * @returns The offer, or undefined when Java's would be null.
 */
export const javaTradeOffer = (
    id: string,
    trade: JavaVillagerTrade,
    tier: number,
    session: JavaTradeSession
): TradeOffer | undefined => {
    if (!session.accepts(id, trade)) return undefined;
    const given = session.given(id, trade);
    if (given === undefined || given.count <= 0) return undefined;

    const { [ADDITIONAL_TRADE_COST]: cost, ...components } = given.components;
    let extra = typeof cost === 'number' ? cost : 0;
    const gives: JavaTradeStack = { id: given.id, count: given.count, components };
    if (
        trade.doubleTradePriceEnchantments !== undefined &&
        storedEnchantmentsOf(gives).some((enchantment) => session.doublesPrice(id, trade, enchantment))
    )
        extra *= 2;

    const priced = (want: JavaTradeStack, added: number): JavaTradeStack | undefined => {
        const count = clamp(want.count + added, 0, session.maxStackSize(want.id));
        return count < 1 ? undefined : { ...want, count };
    };
    const wants = priced(trade.wants, extra);
    if (wants === undefined) return undefined;
    const additional = trade.additionalWants === undefined ? undefined : priced(trade.additionalWants, 0);
    if (trade.additionalWants !== undefined && additional === undefined) return undefined;

    return {
        tier,
        wants: [wants, ...(additional === undefined ? [] : [additional])].map((stack) => session.tradeStackOf(stack)),
        gives: [session.tradeStackOf(gives)],
        priceMultipliers: [Math.max(0, trade.reputationDiscount), ...(additional === undefined ? [] : [0])],
        traderExp: Math.max(0, trade.xp),
        maxUses: Math.max(1, trade.maxUses),
        rewardExp: true
    };
};

/** The offers one set adds to a tier, `AbstractVillager.addOffersFromTradeSet`. */
const drawSet = (host: JavaTradeHost, setId: string, tier: number): readonly TradeOffer[] => {
    const set = host.tradeSet(setId);
    if (set === undefined) {
        host.report?.('trading.unknownTradeSet', `no trade set ${setId}`);
        return [];
    }
    const session = host.session(set);
    const pool = host.tradesOf(set).flatMap((id) => {
        const trade = host.trade(id);
        if (trade === undefined) host.report?.('trading.unknownVillagerTrade', `no villager trade ${id}`);
        return trade === undefined ? [] : [{ id, trade }];
    });

    const offers: TradeOffer[] = [];
    while (offers.length < set.amount && pool.length > 0) {
        const index = session.random.nextInt(pool.length);
        const { id, trade } = pool[index]!;
        const offer = javaTradeOffer(id, trade, tier, session);
        // Without duplicates a drawn trade leaves the pool either way; with them only a trade that
        // made no offer does, so the next draw cannot pick it again.
        if (!set.allowDuplicates || offer === undefined) pool.splice(index, 1);
        if (offer !== undefined) offers.push(offer);
    }
    return offers;
};

/**
 * Java's trade sets as an {@link OfferSource}: each tier draws its sets in order.
 *
 * @param tiers - The trade set ids of each tier, such as {@link javaVillagerTradeSets}.
 * @param tierRequirements - The experience each tier needs, {@link JAVA_VILLAGER_LEVEL_EXPERIENCE}
 *   for a villager.
 */
export const javaOfferSource = (
    host: JavaTradeHost,
    tiers: readonly (readonly string[])[],
    tierRequirements: readonly number[]
): OfferSource => ({
    tierRequirements,
    draw: (from, to) => {
        const offers: TradeOffer[] = [];
        for (let tier = from; tier < Math.min(to, tiers.length); tier += 1)
            for (const set of tiers[tier] ?? []) offers.push(...drawSet(host, set, tier));
        return offers;
    }
});
