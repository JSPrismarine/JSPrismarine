import type { RandomSource } from '@jsprismarine/predicates';

import type { EconomyTradeTableSettings } from './component';
import { parseEconomyTradeTable } from './component';
import type { TradeEnchanting, TradeFunctionApplier, TradeStack } from './functions';
import type { OfferGenerationOptions, TradeContext, TradeOffer } from './offers';
import { generateOffers, unlockedTierCount } from './offers';
import type { TradeTable } from './tables';

/**
 * The trading economy: uses, demand, experience, levels, restock and the
 * discounts.
 *
 * Mojang names the fields and publishes none of the formulas. The docs say
 * `price_multiplier` "sets how much the item's price can increase due to
 * supply and demand changes", `max_uses` is "how many times the trade can be
 * made before the trader needs to restock", `minecraft:trade_resupply`
 * "Resupplies an entity's trade", and `cured_discount`,
 * `nearby_cured_discount` and `hero_demand_discount` exist. The formulas, the
 * restock schedule and the gossip system are written down nowhere.
 *
 * So this package uses Java Edition's model, which is the only published one,
 * and names the two places where it had to choose. Demand rises at restock,
 * not inside a stock cycle: `demand = demand + uses - (maxUses - uses)`, which
 * is Java's `MerchantOffer.updateDemand`. The discount fields are read as flat
 * deltas on the first want rather than as percentages, because -25 to -20 off
 * an emerald price is what a cured villager actually charges, and
 * `max_nearby_cured_discount` of -200 only reads as a cap on a running total.
 */

/** Why a trade did not happen. */
export type TradeRefusal = 'noSuchOffer' | 'outOfStock';

/** One offer as a trader shows it now. */
export interface LiveOffer {
    readonly offer: TradeOffer;
    readonly uses: number;
    readonly demand: number;
    /** Whether the trade still works before the next restock. */
    readonly available: boolean;
    /** What the player pays now, after demand and the discounts. */
    readonly wants: readonly TradeStack[];
}

/** What one attempt to trade produced. */
export interface TradeResult {
    readonly traded: boolean;
    readonly refusal?: TradeRefusal;
    /** What the player paid, at the price the discounts and demand set. */
    readonly wants?: readonly TradeStack[];
    readonly gives?: readonly TradeStack[];
    /** The experience the trader earned. */
    readonly traderExperience: number;
    /** The experience the player earned, zero when the trade's `reward_exp` is false. */
    readonly playerExperience: number;
    /** Whether the trade unlocked a tier and added its offers. */
    readonly leveledUp: boolean;
}

/** One item stack of a saved offer, with its components as entries so it survives JSON. */
export interface StackSnapshot {
    readonly item: string;
    readonly count: number;
    readonly components: readonly (readonly [string, unknown])[];
}

/** One offer as a save holds it: what it is, and how far its stock and price have moved. */
export interface OfferSnapshot {
    readonly tier: number;
    readonly wants: readonly StackSnapshot[];
    readonly gives: readonly StackSnapshot[];
    readonly priceMultipliers: readonly number[];
    readonly traderExp: number;
    readonly maxUses: number;
    readonly rewardExp: boolean;
    readonly uses: number;
    readonly demand: number;
}

/**
 * Everything about a trader that cannot be drawn again: the offers it generated, how much of each
 * was used, the demand on each, its experience and the cured discount it drew. Plain JSON, so a
 * save can hold it as a string.
 */
export interface MerchantSnapshot {
    readonly version: 1;
    readonly experience: number;
    readonly generatedTiers: number;
    readonly curedDiscount?: number;
    readonly offers: readonly OfferSnapshot[];
}

/** How to build a {@link Merchant}. */
export interface MerchantOptions {
    readonly table: TradeTable;
    readonly random: RandomSource;
    /** The `minecraft:economy_trade_table` body, which carries the discount parameters. */
    readonly settings?: EconomyTradeTableSettings;
    readonly context?: TradeContext;
    readonly enchanting?: TradeEnchanting;
    readonly functions?: ReadonlyMap<string, TradeFunctionApplier>;
    /** The trader's experience when it is loaded from a save rather than created. */
    readonly experience?: number;
    /**
     * How much experience a trade with `reward_exp` gives the player. Mojang
     * publishes no number; the default is Java's 3 to 6 for a villager.
     */
    readonly playerRewardExp?: { readonly min: number; readonly max: number };
    readonly report?: (code: string, message: string) => void;
    /**
     * What {@link Merchant.snapshot} saved. The offers, uses, demand, experience and cured discount
     * come back exactly, and nothing is drawn again for tiers the snapshot already holds, which is
     * what `persist_trades` asks for across a restart. Takes precedence over `experience`.
     */
    readonly snapshot?: MerchantSnapshot;
}

interface OfferState {
    readonly offer: TradeOffer;
    uses: number;
    demand: number;
}

const stackSnapshotOf = (stack: TradeStack): StackSnapshot => ({
    item: stack.item,
    count: stack.count,
    components: [...stack.components]
});

const stackOf = (saved: StackSnapshot): TradeStack => ({
    item: saved.item,
    count: saved.count,
    components: new Map(saved.components)
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const stackSnapshotIn = (value: unknown): StackSnapshot | undefined => {
    if (!isRecord(value) || typeof value.item !== 'string' || !finite(value.count) || !Array.isArray(value.components))
        return undefined;
    const components: (readonly [string, unknown])[] = [];
    for (const entry of value.components) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') return undefined;
        components.push([entry[0], entry[1]]);
    }
    return { item: value.item, count: value.count, components };
};

const stacksIn = (value: unknown): StackSnapshot[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const stacks = value.map(stackSnapshotIn);
    return stacks.every((stack) => stack !== undefined) ? stacks : undefined;
};

/**
 * Reads a saved snapshot back, checking every field it will use.
 *
 * @param value - Parsed JSON, from a save that may be old, hand-edited or damaged.
 * @returns The snapshot, or undefined when anything about it is wrong; the caller then lets the
 * trader draw its offers afresh rather than trading from numbers nothing vouches for.
 */
export const merchantSnapshotIn = (value: unknown): MerchantSnapshot | undefined => {
    if (!isRecord(value) || value.version !== 1) return undefined;
    if (!finite(value.experience) || !finite(value.generatedTiers) || !Array.isArray(value.offers)) return undefined;
    if (value.curedDiscount !== undefined && !finite(value.curedDiscount)) return undefined;

    const offers: OfferSnapshot[] = [];
    for (const saved of value.offers) {
        if (!isRecord(saved)) return undefined;
        const wants = stacksIn(saved.wants);
        const gives = stacksIn(saved.gives);
        const multipliers = saved.priceMultipliers;
        if (
            wants === undefined ||
            gives === undefined ||
            !Array.isArray(multipliers) ||
            !multipliers.every(finite) ||
            !finite(saved.tier) ||
            !finite(saved.traderExp) ||
            !finite(saved.maxUses) ||
            !finite(saved.uses) ||
            !finite(saved.demand) ||
            typeof saved.rewardExp !== 'boolean'
        )
            return undefined;
        offers.push({
            tier: saved.tier,
            wants,
            gives,
            priceMultipliers: multipliers,
            traderExp: saved.traderExp,
            maxUses: saved.maxUses,
            rewardExp: saved.rewardExp,
            uses: saved.uses,
            demand: saved.demand
        });
    }

    return {
        version: 1,
        experience: value.experience,
        generatedTiers: value.generatedTiers,
        ...(value.curedDiscount === undefined ? {} : { curedDiscount: value.curedDiscount }),
        offers
    };
};

/** Draws an integer in the inclusive range. */
const between = (random: RandomSource, min: number, max: number): number =>
    max <= min ? min : min + random.nextInt(max - min + 1);

/** Clamps a negative running discount at a negative floor. */
const clampDiscount = (value: number, floor: number): number => Math.max(value, floor);

/** Java's reward range for a villager trade, which Bedrock does not publish. */
const DEFAULT_REWARD_EXP = { min: 3, max: 6 };

/**
 * One trader's offers and their economy.
 *
 * A caller creates one per villager or wandering trader, asks it for
 * {@link offers}, and calls {@link trade} and {@link resupply}. The offers are
 * generated once, which is what `persist_trades` means, and a level up appends
 * the new tier's offers rather than redrawing the old ones.
 */
export class Merchant {
    private readonly table: TradeTable;
    private readonly random: RandomSource;
    private readonly settings: EconomyTradeTableSettings;
    private readonly rewardExp: { readonly min: number; readonly max: number };
    private readonly generation: OfferGenerationOptions;
    private readonly states: OfferState[] = [];
    private experiencePoints: number;
    private generatedTiers = 0;
    private curedDiscount: number | undefined;

    public constructor(options: MerchantOptions) {
        this.table = options.table;
        this.random = options.random;
        this.settings = options.settings ?? parseEconomyTradeTable({});
        this.rewardExp = options.playerRewardExp ?? DEFAULT_REWARD_EXP;
        this.experiencePoints = options.experience ?? 0;

        const generation: { -readonly [Key in keyof OfferGenerationOptions]: OfferGenerationOptions[Key] } = {
            table: options.table,
            random: options.random
        };
        if (options.context !== undefined) generation.context = options.context;
        if (options.enchanting !== undefined) generation.enchanting = options.enchanting;
        if (options.functions !== undefined) generation.functions = options.functions;
        if (options.report !== undefined) generation.report = options.report;
        this.generation = generation;

        if (options.snapshot !== undefined) this.restoreFrom(options.snapshot);
        this.generateUpTo(unlockedTierCount(this.table, this.experiencePoints));
    }

    /** Takes the trader's state back from a save, leaving only tiers the save lacks to be generated. */
    private restoreFrom(snapshot: MerchantSnapshot): void {
        this.experiencePoints = snapshot.experience;
        this.generatedTiers = snapshot.generatedTiers;
        this.curedDiscount = snapshot.curedDiscount;
        for (const saved of snapshot.offers) {
            this.states.push({
                offer: {
                    tier: saved.tier,
                    wants: saved.wants.map(stackOf),
                    gives: saved.gives.map(stackOf),
                    priceMultipliers: saved.priceMultipliers,
                    traderExp: saved.traderExp,
                    maxUses: saved.maxUses,
                    rewardExp: saved.rewardExp
                },
                uses: saved.uses,
                demand: saved.demand
            });
        }
    }

    /** The state a save has to keep for this trader to come back as the same trader. */
    public snapshot(): MerchantSnapshot {
        return {
            version: 1,
            experience: this.experiencePoints,
            generatedTiers: this.generatedTiers,
            ...(this.curedDiscount === undefined ? {} : { curedDiscount: this.curedDiscount }),
            offers: this.states.map(({ offer, uses, demand }) => ({
                tier: offer.tier,
                wants: offer.wants.map(stackSnapshotOf),
                gives: offer.gives.map(stackSnapshotOf),
                priceMultipliers: offer.priceMultipliers,
                traderExp: offer.traderExp,
                maxUses: offer.maxUses,
                rewardExp: offer.rewardExp,
                uses,
                demand
            }))
        };
    }

    /** The trader's experience, which is what unlocks tiers. */
    public get experience(): number {
        return this.experiencePoints;
    }

    /** The trader's level, which is how many tiers its experience has unlocked. */
    public get level(): number {
        return unlockedTierCount(this.table, this.experiencePoints);
    }

    /**
     * The offers as a player sees them now.
     *
     * @param context - The player's state, which the discounts read. Falls back
     * to the context the merchant was built with.
     */
    public offers(context?: TradeContext): readonly LiveOffer[] {
        return this.states.map((state) => ({
            offer: state.offer,
            uses: state.uses,
            demand: state.demand,
            available: state.uses < state.offer.maxUses,
            wants: this.priceOf(state, context ?? this.generation.context)
        }));
    }

    /**
     * Runs one trade.
     *
     * @param index - The offer's position in {@link offers}.
     * @returns What the player paid and earned, or the refusal.
     */
    public trade(index: number, context?: TradeContext): TradeResult {
        const state = this.states[index];
        if (state === undefined)
            return {
                traded: false,
                refusal: 'noSuchOffer',
                traderExperience: 0,
                playerExperience: 0,
                leveledUp: false
            };
        if (state.uses >= state.offer.maxUses)
            return { traded: false, refusal: 'outOfStock', traderExperience: 0, playerExperience: 0, leveledUp: false };

        const wants = this.priceOf(state, context ?? this.generation.context);
        state.uses += 1;

        const before = this.level;
        this.experiencePoints += state.offer.traderExp;
        const after = unlockedTierCount(this.table, this.experiencePoints);
        if (after > before) this.generateUpTo(after);

        return {
            traded: true,
            wants,
            gives: state.offer.gives,
            traderExperience: state.offer.traderExp,
            playerExperience: state.offer.rewardExp ? between(this.random, this.rewardExp.min, this.rewardExp.max) : 0,
            leveledUp: after > before
        };
    }

    /**
     * Restocks every offer, which is what `minecraft:trade_resupply` asks for.
     *
     * Demand moves first, by Java's rule: a trade used to its limit gains its
     * whole use count, and a trade nobody touched loses it.
     */
    public resupply(): void {
        for (const state of this.states) {
            state.demand = Math.max(0, state.demand + state.uses - (state.offer.maxUses - state.uses));
            state.uses = 0;
        }
    }

    /** Generates the offers of every tier up to `tiers` that has none yet. */
    private generateUpTo(tiers: number): void {
        if (tiers <= this.generatedTiers) return;
        const experienceForTier = this.table.tiers[tiers - 1]?.totalExpRequired ?? 0;
        const generated = generateOffers({
            ...this.generation,
            traderExp: Math.max(this.experiencePoints, experienceForTier)
        });

        for (const offer of generated) {
            if (offer.tier < this.generatedTiers) continue;
            this.states.push({ offer, uses: 0, demand: 0 });
        }
        this.generatedTiers = tiers;
    }

    /**
     * The price of one offer now.
     *
     * Demand raises every want by `floor(base * demand * price_multiplier)`.
     * The discounts land on the first want alone, which is the emerald side of
     * every vanilla trade, and no price falls below one item.
     */
    private priceOf(state: OfferState, context: TradeContext | undefined): readonly TradeStack[] {
        const discount = this.discountFor(context);

        return state.offer.wants.map((want, index) => {
            const multiplier = state.offer.priceMultipliers[index] ?? 0;
            const demand = Math.floor(want.count * state.demand * multiplier);
            const adjusted = want.count + demand + (index === 0 ? discount : 0);
            return { item: want.item, count: Math.max(1, adjusted), components: want.components };
        });
    }

    /** The flat discount the player's state earns, already clamped by its maxima. */
    private discountFor(context: TradeContext | undefined): number {
        if (context === undefined) return 0;
        let discount = 0;

        if (context.curedByPlayer === true) {
            this.curedDiscount ??= between(
                this.random,
                this.settings.curedDiscount.min,
                this.settings.curedDiscount.max
            );
            discount += clampDiscount(
                this.curedDiscount,
                Math.min(this.settings.maxCuredDiscount.min, this.settings.maxCuredDiscount.max)
            );
        }

        const nearby = context.nearbyCured ?? 0;
        if (nearby > 0)
            discount += clampDiscount(nearby * this.settings.nearbyCuredDiscount, this.settings.maxNearbyCuredDiscount);

        const hero = context.heroOfTheVillage ?? 0;
        if (hero > 0) discount += hero * this.settings.heroDemandDiscount;

        return discount;
    }
}
