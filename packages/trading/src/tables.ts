import type { Diagnostic } from '@jsprismarine/entities';
import type { Filter } from '@jsprismarine/packs';
import { FilterParseError, parseFilter } from '@jsprismarine/packs';

/**
 * The trade table grammar.
 *
 * A file is `{"tiers": [...]}`, optionally with a `format_version`; 17 of the
 * 27 vanilla files write no version. `Trade Table.json` requires `groups`
 * under a tier, and the documentation shows `trades` directly under one, which
 * is what the 13 legacy `trading/*.json` tables write. Both forms parse, and a
 * bare `trades` list becomes one group that selects all of its trades, so
 * everything downstream sees one shape.
 *
 * The schema and the documentation give different defaults for three fields.
 * The schema says `max_uses` 7, `price_multiplier` 0 and `num_to_select` 0;
 * the documentation says 12, 0.05 and 1. This package takes the
 * documentation's, because the documentation describes the running engine
 * while the schema describes an editor. Vanilla sets `max_uses` and
 * `price_multiplier` explicitly on almost every economy trade, so the choice
 * only reaches custom packs and the legacy tables.
 */

/** An inclusive quantity range. A trade item that writes one number has `min` equal to `max`. */
export interface QuantityRange {
    readonly min: number;
    readonly max: number;
}

/** One loot function on a trade item, kept whole so the applier reads its own fields. */
export interface TradeFunctionSpec {
    /** The `function` field, such as `enchant_with_levels`. */
    readonly name: string;
    /** The function's body, including the `function` key itself. */
    readonly body: Readonly<Record<string, unknown>>;
}

/** One `TradeItem`: what the trade wants or gives before its quantity is drawn. */
export interface TradeItem {
    readonly item: string;
    readonly quantity: QuantityRange;
    /** How much demand raises this item's price, per point of demand. */
    readonly priceMultiplier: number;
    readonly functions: readonly TradeFunctionSpec[];
    /** The filters that decide whether this item may be offered at all. */
    readonly filters?: Filter;
}

/**
 * One member of `wants` or `gives`.
 *
 * The grammar writes either a `TradeItem` or `{choice: [TradeItem]}`. Both
 * become a list, so a plain item is a choice of one and offer generation has
 * one case to handle.
 */
export interface TradeItemSlot {
    readonly choices: readonly TradeItem[];
}

/** One trade: what it takes, what it gives and what it costs the trader. */
export interface TradeDefinition {
    readonly wants: readonly TradeItemSlot[];
    readonly gives: readonly TradeItemSlot[];
    /** The experience the trader earns per use, which is what unlocks the next tier. */
    readonly traderExp: number;
    /** How many times the trade works before the trader restocks. */
    readonly maxUses: number;
    /** Whether the player earns experience from the trade. */
    readonly rewardExp: boolean;
    /** The weight of this trade in its group's draw. */
    readonly weight: number;
}

/** One `num_to_select` draw over a list of trades. */
export interface TradeGroup {
    /** How many trades to offer. A negative number offers every trade in the group. */
    readonly numToSelect: number;
    readonly trades: readonly TradeDefinition[];
}

/** One tier, unlocked once the trader's experience reaches `totalExpRequired`. */
export interface TradeTier {
    readonly totalExpRequired: number;
    readonly groups: readonly TradeGroup[];
}

/** One parsed `trading/*.json`. */
export interface TradeTable {
    readonly formatVersion?: string;
    readonly tiers: readonly TradeTier[];
}

/** Where a parse reports its findings. */
export interface TradeTableParseOptions {
    readonly pack: string;
    readonly path?: string;
    readonly report?: (diagnostic: Diagnostic) => void;
}

const TIER_KEYS = new Set(['total_exp_required', 'groups', 'trades']);
const GROUP_KEYS = new Set(['num_to_select', 'trades']);
const TRADE_KEYS = new Set(['wants', 'gives', 'trader_exp', 'max_uses', 'reward_exp', 'weight']);
const ITEM_KEYS = new Set(['item', 'quantity', 'functions', 'filters', 'price_multiplier', 'choice']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const numberAt = (source: Record<string, unknown>, key: string, fallback: number): number => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

/** The documented defaults, which differ from the schema's for three of these. */
const DEFAULT_MAX_USES = 12;
const DEFAULT_TRADER_EXP = 1;
const DEFAULT_PRICE_MULTIPLIER = 0.05;
const DEFAULT_NUM_TO_SELECT = 1;

type Fail = (code: string, message: string) => void;

const reportUnknown = (value: Record<string, unknown>, known: ReadonlySet<string>, where: string, fail: Fail): void => {
    for (const key of Object.keys(value)) {
        if (!known.has(key)) fail('tradeTable.unknownKey', `unknown ${where} key ${key}`);
    }
};

const parseQuantity = (value: unknown): QuantityRange => {
    if (typeof value === 'number' && Number.isFinite(value)) return { min: value, max: value };
    if (isRecord(value)) {
        const max = numberAt(value, 'max', 1);
        return { min: numberAt(value, 'min', 1), max };
    }
    return { min: 1, max: 1 };
};

const parseItem = (value: unknown, fail: Fail): TradeItem | undefined => {
    if (!isRecord(value) || typeof value.item !== 'string') {
        fail('tradeTable.badItem', `a trade item needs a string \`item\`, got ${JSON.stringify(value)}`);
        return undefined;
    }
    reportUnknown(value, ITEM_KEYS, 'trade item', fail);

    const functions: TradeFunctionSpec[] = [];
    for (const entry of Array.isArray(value.functions) ? value.functions : []) {
        if (!isRecord(entry) || typeof entry.function !== 'string') {
            fail('tradeTable.badFunction', `a trade item function needs a string \`function\``);
            continue;
        }
        functions.push({ name: entry.function, body: entry });
    }

    const item: { -readonly [Key in keyof TradeItem]: TradeItem[Key] } = {
        item: value.item,
        quantity: parseQuantity(value.quantity),
        priceMultiplier: numberAt(value, 'price_multiplier', DEFAULT_PRICE_MULTIPLIER),
        functions
    };

    if (value.filters !== undefined) {
        try {
            item.filters = parseFilter(value.filters);
        } catch (error) {
            if (!(error instanceof FilterParseError)) throw error;
            fail('tradeTable.badFilter', `a trade item filter does not parse: ${error.message}`);
        }
    }

    return item;
};

const parseSlot = (value: unknown, fail: Fail): TradeItemSlot | undefined => {
    if (isRecord(value) && Array.isArray(value.choice)) {
        const choices = value.choice.map((choice) => parseItem(choice, fail)).filter((choice) => choice !== undefined);
        if (choices.length === 0) return undefined;
        return { choices };
    }
    const item = parseItem(value, fail);
    return item === undefined ? undefined : { choices: [item] };
};

const parseSlots = (value: unknown, fail: Fail): readonly TradeItemSlot[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const slots = value.map((slot) => parseSlot(slot, fail)).filter((slot) => slot !== undefined);
    return slots.length === value.length ? slots : undefined;
};

const parseTrade = (value: unknown, fail: Fail): TradeDefinition | undefined => {
    if (!isRecord(value)) {
        fail('tradeTable.badTrade', 'a trade must be an object');
        return undefined;
    }
    reportUnknown(value, TRADE_KEYS, 'trade', fail);

    const wants = parseSlots(value.wants, fail);
    const gives = parseSlots(value.gives, fail);
    if (wants === undefined || gives === undefined) {
        fail('tradeTable.badTrade', 'a trade needs a `wants` list and a `gives` list');
        return undefined;
    }

    return {
        wants,
        gives,
        traderExp: numberAt(value, 'trader_exp', DEFAULT_TRADER_EXP),
        maxUses: numberAt(value, 'max_uses', DEFAULT_MAX_USES),
        rewardExp: value.reward_exp !== false,
        weight: numberAt(value, 'weight', 1)
    };
};

const parseTrades = (value: unknown, fail: Fail): readonly TradeDefinition[] =>
    (Array.isArray(value) ? value : []).map((trade) => parseTrade(trade, fail)).filter((trade) => trade !== undefined);

const parseGroup = (value: unknown, fail: Fail): TradeGroup | undefined => {
    if (!isRecord(value)) {
        fail('tradeTable.badGroup', 'a trade group must be an object');
        return undefined;
    }
    reportUnknown(value, GROUP_KEYS, 'trade group', fail);
    return {
        numToSelect: numberAt(value, 'num_to_select', DEFAULT_NUM_TO_SELECT),
        trades: parseTrades(value.trades, fail)
    };
};

const parseTier = (value: unknown, fail: Fail): TradeTier | undefined => {
    if (!isRecord(value)) {
        fail('tradeTable.badTier', 'a tier must be an object');
        return undefined;
    }
    reportUnknown(value, TIER_KEYS, 'tier', fail);

    const groups: TradeGroup[] = [];
    // A legacy tier holds its trades directly. All of them are offered, which
    // is what `num_to_select` of -1 means in the economy form.
    if (Array.isArray(value.trades)) groups.push({ numToSelect: -1, trades: parseTrades(value.trades, fail) });
    for (const group of Array.isArray(value.groups) ? value.groups : []) {
        const parsed = parseGroup(group, fail);
        if (parsed !== undefined) groups.push(parsed);
    }

    return { totalExpRequired: numberAt(value, 'total_exp_required', 0), groups };
};

/**
 * Parses one `trading/*.json` file, in either the economy or the legacy form.
 *
 * @returns The table, or undefined when the file has no `tiers` array. A
 * malformed tier, group, trade or item is dropped and reported; everything
 * else loads.
 */
export const parseTradeTable = (file: unknown, options: TradeTableParseOptions): TradeTable | undefined => {
    const fail: Fail = (code, message) => {
        const diagnostic: Diagnostic = { severity: 'error', code, pack: options.pack, message };
        if (options.path !== undefined) diagnostic.path = options.path;
        options.report?.(diagnostic);
    };

    if (!isRecord(file) || !Array.isArray(file.tiers)) {
        fail('tradeTable.notATradeTable', 'the file has no `tiers` array');
        return undefined;
    }

    const table: { -readonly [Key in keyof TradeTable]: TradeTable[Key] } = {
        tiers: file.tiers.map((tier) => parseTier(tier, fail)).filter((tier) => tier !== undefined)
    };
    if (typeof file.format_version === 'string') table.formatVersion = file.format_version;
    return table;
};
