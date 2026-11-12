/**
 * Villager trading, out of the entity's own components.
 *
 * Two components point an entity at a trade table:
 * `minecraft:economy_trade_table`, which the modern villager and the wandering
 * trader carry and which holds the discount parameters, and the legacy
 * `minecraft:trade_table`, which the pre-1.11 villager carries. Both name a
 * pack-relative file, and `ServerContent.tradeTables` is keyed by exactly that
 * path.
 *
 * `@jsprismarine/trading` owns the tiers, the demand and the restock; this
 * module is only the wiring between a live entity's components and one
 * `Merchant`, and the logging of what a trader offers: a draw, a trade and a
 * restock each change the `Merchant` in place, so each is logged as the
 * trader's {@link MERCHANT_FIELD} before and after it.
 */
import type { EntityInstance } from '@jsprismarine/entities';
import { Merchant, merchantSnapshotIn, parseEconomyTradeTable, parseTradeTableComponent } from '@jsprismarine/trading';
import type { MerchantSnapshot } from '@jsprismarine/trading';
import type { RandomSource } from '@jsprismarine/predicates';

import type { ServerContent } from '../../content/ServerContent';
import type { TradeSource } from '../../network/PlayerSession';
import type { PlainData } from '../../world/changelog/PlainData';
import { plainOf } from '../../world/changelog/PlainData';
import { LoggedFieldError } from './entityFields';

/**
 * The entity field a trader's offers are logged under: its {@link MerchantSnapshot} in the form a
 * save writes, or null before it has drawn any.
 */
export const MERCHANT_FIELD = 'merchant';

/**
 * A trader's offers as the log holds them: the JSON round trip a save makes, so the value is
 * plain data and is what a save would write.
 */
export const merchantFieldOf = (snapshot: MerchantSnapshot | undefined): PlainData => {
    if (snapshot === undefined) return null;
    const plain = plainOf(JSON.parse(JSON.stringify(snapshot)));
    if (plain === undefined) throw new LoggedFieldError('a merchant snapshot has no plain form');
    return plain;
};

/**
 * Reads a logged {@link MERCHANT_FIELD} back.
 * @returns The snapshot, or undefined for a trader that has drawn nothing.
 */
export const merchantIn = (value: PlainData): MerchantSnapshot | undefined => {
    if (value === null) return undefined;
    return merchantSnapshotIn(value) ?? wrongMerchant(value);
};

const wrongMerchant = (value: PlainData): never => {
    throw new LoggedFieldError(`merchant cannot hold ${JSON.stringify(value)}`);
};

/**
 * One trader as a trade screen sees it. Its merchant is read again on every call, because undoing
 * a trade builds the merchant again from the logged offers, and each trade is logged.
 * @param current - The trader's merchant now.
 * @param logged - Runs a change to a merchant and logs its offers before and after.
 */
export const loggedMerchantSource = (
    current: () => Merchant,
    logged: <T>(merchant: Merchant, change: () => T) => T
): TradeSource => ({
    // Logged too: the first offers a curing player is shown draw the trader's cured discount.
    offers: (context) => {
        const merchant = current();
        return logged(merchant, () => merchant.offers(context));
    },
    trade: (index, context) => {
        const merchant = current();
        return logged(merchant, () => merchant.trade(index, context));
    },
    tierRequirements: () => current().tierRequirements(),
    get level() {
        return current().level;
    }
});

/** The modern component, which carries the discount parameters as well as the table. */
export const ECONOMY_TRADE_TABLE = 'minecraft:economy_trade_table';

/** The legacy component, which carries the table and nothing else. */
export const LEGACY_TRADE_TABLE = 'minecraft:trade_table';

/** How to build one trader. */
export interface MerchantOptions {
    readonly content: ServerContent;
    readonly random: RandomSource;
    /** The trader's experience when it comes back from a save rather than being created. */
    readonly experience?: number;
    /** What a save kept of this trader's offers and progression; they come back instead of being drawn. */
    readonly snapshot?: MerchantSnapshot;
    /** Receives what the trade table generation met and could not carry out. */
    readonly report?: (code: string, message: string) => void;
}

/**
 * The profession a villager's trade table names, such as `farmer` for `farmer_trades.json`.
 *
 * Bedrock gives a villager its profession through the table it trades from rather than a field of
 * its own, so this is where the brain's job-site and work behaviors learn it.
 *
 * @returns The bare profession, or undefined when the entity names no table or one that is not
 *   `<profession>_trades`.
 */
export const professionOf = (entity: EntityInstance): string | undefined => {
    const economy = entity.componentParams(ECONOMY_TRADE_TABLE);
    const legacy = entity.componentParams(LEGACY_TRADE_TABLE);
    const path =
        economy === undefined
            ? legacy === undefined
                ? undefined
                : parseTradeTableComponent(legacy).table
            : parseEconomyTradeTable(economy).table;
    return path?.match(/([a-z_]+?)_trades?\.json$/)?.[1];
};

/**
 * Builds the merchant one entity trades through.
 *
 * @returns The merchant, or undefined when the entity carries neither trade
 *   component or names a table the pack stack has no file for. Nothing is
 *   invented: a villager whose table is missing simply does not trade, rather
 *   than offering an empty screen.
 */
export const merchantFor = (entity: EntityInstance, options: MerchantOptions): Merchant | undefined => {
    const economy = entity.componentParams(ECONOMY_TRADE_TABLE);
    const legacy = entity.componentParams(LEGACY_TRADE_TABLE);
    if (economy === undefined && legacy === undefined) return undefined;

    const settings = economy === undefined ? undefined : parseEconomyTradeTable(economy);
    const path = settings?.table ?? (legacy === undefined ? undefined : parseTradeTableComponent(legacy).table);
    if (path === undefined) return undefined;

    const table = options.content.tradeTables.get(path);
    if (table === undefined) return undefined;

    return new Merchant({
        table,
        random: options.random,
        ...(settings === undefined ? {} : { settings }),
        ...(options.experience === undefined ? {} : { experience: options.experience }),
        ...(options.snapshot === undefined ? {} : { snapshot: options.snapshot }),
        ...(options.report === undefined ? {} : { report: options.report })
    });
};

/**
 * The name a trade screen is titled with, such as `entity.villager.farmer`, which the client
 * translates into the profession.
 *
 * @returns The table component's `display_name`, or undefined when the entity names none.
 */
export const tradeDisplayNameOf = (entity: EntityInstance): string | undefined => {
    const economy = entity.componentParams(ECONOMY_TRADE_TABLE);
    if (economy !== undefined) return parseEconomyTradeTable(economy).displayName;

    const legacy = entity.componentParams(LEGACY_TRADE_TABLE);
    return legacy === undefined ? undefined : parseTradeTableComponent(legacy).displayName;
};
