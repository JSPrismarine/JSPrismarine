/**
 * The two components that point an entity at a trade table.
 *
 * `minecraft:economy_trade_table` carries the discount parameters the economy
 * needs, and `minecraft:trade_table` is the legacy component the legacy
 * `minecraft:villager` uses. `@jsprismarine/entities` parses both
 * structurally; this module reads the fields the economy acts on.
 */

/** A `{min, max}` body, which vanilla writes as a two-member array. */
export interface DiscountRange {
    readonly min: number;
    readonly max: number;
}

/** What `minecraft:economy_trade_table` declares. */
export interface EconomyTradeTableSettings {
    /** The path of the table file, such as `trading/economy_trades/farmer_trades.json`. */
    readonly table?: string;
    readonly displayName?: string;
    readonly newScreen: boolean;
    /** Whether the generated offers survive a save and reload. */
    readonly persistTrades: boolean;
    /** Whether a legacy table's offers convert into economy offers on load. */
    readonly convertTradesEconomy: boolean;
    readonly showTradeScreen: boolean;
    /** The discount a villager the player cured applies, drawn inside the range. */
    readonly curedDiscount: DiscountRange;
    /** The furthest the cured discount may go. */
    readonly maxCuredDiscount: DiscountRange;
    /** The discount each other cured villager nearby adds. */
    readonly nearbyCuredDiscount: number;
    /** The furthest the nearby cured discounts may add up to. */
    readonly maxNearbyCuredDiscount: number;
    /** The discount each level of Hero of the Village applies. */
    readonly heroDemandDiscount: number;
    readonly useLegacyPriceFormula: boolean;
}

/** What `minecraft:trade_table` declares, which is the legacy component's smaller body. */
export interface TradeTableSettings {
    readonly table?: string;
    readonly displayName?: string;
    readonly convertTradesEconomy: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const stringAt = (source: Record<string, unknown>, key: string): string | undefined => {
    const value = source[key];
    return typeof value === 'string' ? value : undefined;
};

const numberAt = (source: Record<string, unknown>, key: string, fallback: number): number => {
    const value = source[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

/**
 * Reads a range written as `{min, max}` or, as every vanilla villager writes
 * it, as a two-member array.
 */
const rangeAt = (source: Record<string, unknown>, key: string, fallback: DiscountRange): DiscountRange => {
    const value = source[key];
    if (Array.isArray(value) && value.length >= 2) {
        const [min, max] = value;
        if (typeof min === 'number' && typeof max === 'number') return { min, max };
    }
    if (isRecord(value))
        return { min: numberAt(value, 'min', fallback.min), max: numberAt(value, 'max', fallback.max) };
    return fallback;
};

/** The documented default of `cured_discount`, which `max_cured_discount` also falls back to. */
const DEFAULT_CURED_DISCOUNT: DiscountRange = { min: -25, max: -20 };

/** Reads `minecraft:economy_trade_table`, filling in the documented defaults. */
export const parseEconomyTradeTable = (value: unknown): EconomyTradeTableSettings => {
    const body = isRecord(value) ? value : {};
    const settings: { -readonly [Key in keyof EconomyTradeTableSettings]: EconomyTradeTableSettings[Key] } = {
        newScreen: body.new_screen === true,
        persistTrades: body.persist_trades === true,
        convertTradesEconomy: body.convert_trades_economy === true,
        showTradeScreen: body.show_trade_screen !== false,
        curedDiscount: rangeAt(body, 'cured_discount', DEFAULT_CURED_DISCOUNT),
        maxCuredDiscount: rangeAt(body, 'max_cured_discount', DEFAULT_CURED_DISCOUNT),
        nearbyCuredDiscount: numberAt(body, 'nearby_cured_discount', -20),
        maxNearbyCuredDiscount: numberAt(body, 'max_nearby_cured_discount', -200),
        heroDemandDiscount: numberAt(body, 'hero_demand_discount', -4),
        useLegacyPriceFormula: body.use_legacy_price_formula === true
    };

    const table = stringAt(body, 'table');
    if (table !== undefined) settings.table = table;
    const displayName = stringAt(body, 'display_name');
    if (displayName !== undefined) settings.displayName = displayName;
    return settings;
};

/** Reads the legacy `minecraft:trade_table`. */
export const parseTradeTableComponent = (value: unknown): TradeTableSettings => {
    const body = isRecord(value) ? value : {};
    const settings: { -readonly [Key in keyof TradeTableSettings]: TradeTableSettings[Key] } = {
        convertTradesEconomy: body.convert_trades_economy === true
    };

    const table = stringAt(body, 'table');
    if (table !== undefined) settings.table = table;
    const displayName = stringAt(body, 'display_name');
    if (displayName !== undefined) settings.displayName = displayName;
    return settings;
};
