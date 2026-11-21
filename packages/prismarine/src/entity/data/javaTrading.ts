/**
 * A trader's offers from Java's `villager_trade` and `trade_set` registries, through the server's
 * content.
 *
 * `@jsprismarine/trading` draws the offers. This module answers what it asks of the host: the
 * registries and the tags the content loaded, and the Java grammar a trade carries, which the
 * Java loot registry compiles and evaluates in Java's `villager_trade` context with the trader as
 * `this_entity`.
 */
import type { EntityPosition } from '@jsprismarine/entities';
import type { LootRegistry } from '@jsprismarine/loot';
import type { EntityView, ItemModifier, Predicate, ItemStack as PredicateItemStack } from '@jsprismarine/predicates';
import type { OfferSource, TradeStack } from '@jsprismarine/trading';
import {
    JAVA_VILLAGER_LEVEL_EXPERIENCE,
    JAVA_WANDERING_TRADER_SETS,
    javaOfferSource,
    javaVillagerTradeSets,
    parseJavaTradeSet,
    parseJavaVillagerTrade
} from '@jsprismarine/trading/javaTrades';
import type { JavaTradeHost, JavaTradeStack, JavaVillagerTrade } from '@jsprismarine/trading/javaTrades';
import type { RandomSource } from '@jsprismarine/predicates';

import type { ServerContent } from '../../content/ServerContent';
import { dropOfRolledStack } from '../../item/lootStack';

/** The profession a wandering trader's trade table names, which has no villager levels. */
const WANDERING_TRADER = 'wandering_trader';

/**
 * Java's name for each profession whose Bedrock trade table is named another way; the rest are
 * the same in both editions.
 */
const JAVA_PROFESSIONS: Readonly<Record<string, string>> = {
    leather_worker: 'leatherworker',
    stone_mason: 'mason',
    tool_smith: 'toolsmith',
    weapon_smith: 'weaponsmith'
};

/**
 * Java's villager type for each Bedrock `minecraft:mark_variant`, in the order `villager_v2.json`'s
 * biome component groups number them.
 */
const VILLAGER_TYPES = ['plains', 'desert', 'jungle', 'savanna', 'snow', 'swamp', 'taiga'] as const;

/** What a trader's Java offers read of it and the world. */
export interface JavaTraderOptions {
    readonly content: ServerContent;
    /** The stream the offers draw from, which the runtime logs. */
    readonly random: RandomSource;
    /** Where the trader stands, the trade context's `origin`. */
    readonly position: EntityPosition;
    /** Its `minecraft:mark_variant`, which picks its biome type; undefined reads as plains. */
    readonly markVariant: number | undefined;
    readonly report?: (code: string, message: string) => void;
}

/** One trade's compiled Java grammar. */
interface CompiledTrade {
    readonly predicate: Predicate | undefined;
    readonly modifier: ItemModifier | undefined;
}

/** Each loot registry's compiled trades, so a trade compiles once per content however often it is drawn. */
const compiledTrades = new WeakMap<LootRegistry, Map<string, CompiledTrade>>();

const compiledTrade = (loot: LootRegistry, id: string, trade: JavaVillagerTrade): CompiledTrade => {
    let compiled = compiledTrades.get(loot);
    if (compiled === undefined) {
        compiled = new Map();
        compiledTrades.set(loot, compiled);
    }
    const cached = compiled.get(id);
    if (cached !== undefined) return cached;
    const built: CompiledTrade = {
        predicate:
            trade.merchantPredicate === undefined
                ? undefined
                : loot.predicate(trade.merchantPredicate, `villager_trade/${id}/merchant_predicate`),
        modifier:
            trade.givenItemModifier === undefined
                ? undefined
                : loot.itemModifier(trade.givenItemModifier, `villager_trade/${id}/given_item_modifier`)
    };
    compiled.set(id, built);
    return built;
};

const predicateStackOf = (stack: JavaTradeStack): PredicateItemStack => ({
    id: stack.id,
    count: stack.count,
    components: new Map(Object.entries(stack.components))
});

/**
 * The stack a trade screen offers for a Java stack: its aux value and its enchantments, which
 * are what a trade stack carries to the client, read the way a loot drop reads them.
 */
const tradeStackOf = (stack: JavaTradeStack): TradeStack => {
    const drop = dropOfRolledStack(predicateStackOf(stack));
    const components = new Map<string, unknown>();
    if (drop.meta !== undefined) components.set('minecraft:aux_value', drop.meta);
    if (drop.enchantments !== undefined) components.set('minecraft:enchantments', drop.enchantments);
    return { item: drop.identifier, count: drop.count, components };
};

/** Whether a holder set, an id, a `#tag` or a list of ids, holds an enchantment. */
const holdsEnchantment = (content: ServerContent, set: unknown, enchantment: string): boolean => {
    if (Array.isArray(set)) return set.includes(enchantment);
    if (typeof set !== 'string') return false;
    return set.startsWith('#') ? content.tags.includes('enchantment', set.slice(1), enchantment) : set === enchantment;
};

/** The `villager_trade` ids a `trades` holder set names. */
const tradeIdsOf = (content: ServerContent, trades: unknown): readonly string[] => {
    if (Array.isArray(trades)) return trades.filter((id) => typeof id === 'string');
    if (typeof trades !== 'string') return [];
    return trades.startsWith('#') ? content.tags.members('villager_trade', trades.slice(1)) : [trades];
};

/** The host a trader's Java offers draw through. */
const javaTradeHost = (options: JavaTraderOptions): JavaTradeHost => {
    const { content } = options;
    const variant = VILLAGER_TYPES[options.markVariant ?? 0] ?? VILLAGER_TYPES[0];
    const trader: EntityView = {
        type: 'minecraft:villager',
        position: options.position,
        components: new Map([['minecraft:villager/variant', `minecraft:${variant}`]])
    };

    return {
        tradeSet: (id) => parseJavaTradeSet(content.definitions.tradeSets.get(id)?.data),
        tradesOf: (set) => tradeIdsOf(content, set.trades),
        trade: (id) => parseJavaVillagerTrade(content.definitions.villagerTrades.get(id)?.data),
        // The trader's own logged stream rather than Java's world-wide `random_sequence`, so an
        // undone trade draws its offers again the same way.
        session: () => {
            const context = content.loot.context(undefined, {
                random: options.random,
                parameterSet: 'villager_trade',
                parameters: {
                    origin: options.position,
                    this_entity: trader,
                    additional_cost_component_allowed: true
                }
            });
            return {
                random: context.random,
                accepts: (id, trade) => compiledTrade(content.loot, id, trade).predicate?.(context) ?? true,
                given: (id, trade) => {
                    const modifier = compiledTrade(content.loot, id, trade).modifier;
                    const stack = predicateStackOf(trade.gives);
                    const given = modifier === undefined ? stack : modifier(stack, context);
                    return given === undefined
                        ? undefined
                        : { id: given.id, count: given.count, components: Object.fromEntries(given.components) };
                },
                doublesPrice: (_id, trade, enchantment) =>
                    holdsEnchantment(content, trade.doubleTradePriceEnchantments, enchantment),
                maxStackSize: (item) => context.items.maxStackSize({ id: item, count: 1, components: new Map() }),
                tradeStackOf
            };
        },
        ...(options.report === undefined ? {} : { report: options.report })
    };
};

/**
 * Java's offers for a trader whose Bedrock trade table names `profession`, such as `librarian`
 * for `librarian_trades.json` or `wandering_trader`.
 *
 * @returns The source, or undefined when the content holds no trade set for one of its tiers, so
 *   the trader keeps the Bedrock table it names.
 */
export const javaOfferSourceFor = (profession: string, options: JavaTraderOptions): OfferSource | undefined => {
    const wandering = profession === WANDERING_TRADER;
    const tiers = wandering
        ? [JAVA_WANDERING_TRADER_SETS]
        : javaVillagerTradeSets(JAVA_PROFESSIONS[profession] ?? profession);
    if (!tiers.every((sets) => sets.every((id) => options.content.definitions.tradeSets.has(id)))) return undefined;
    return javaOfferSource(javaTradeHost(options), tiers, wandering ? [0] : JAVA_VILLAGER_LEVEL_EXPERIENCE);
};
