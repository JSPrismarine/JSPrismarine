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
 * `Merchant`.
 */
import type { EntityInstance } from '@jsprismarine/entities';
import { Merchant, parseEconomyTradeTable, parseTradeTableComponent } from '@jsprismarine/trading';
import type { RandomSource } from '@jsprismarine/predicates';

import type { ServerContent } from '../../content/ServerContent';

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
    /** Receives what the trade table generation met and could not carry out. */
    readonly report?: (code: string, message: string) => void;
}

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
        ...(options.report === undefined ? {} : { report: options.report })
    });
};
