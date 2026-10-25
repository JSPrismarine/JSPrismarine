import type { DiagnosticCollector, JsonObject, ParseContext, Predicate } from '@jsprismarine/predicates';
import { predicateAt } from '@jsprismarine/predicates';

/**
 * What the table grammar reads, and what it says when it meets a key it does
 * not.
 *
 * Both halves exist for the same reason. A loot table is gated data, and the
 * two ways a gate goes missing are a key nobody reads and a condition nobody
 * implements. Either one reads downstream as a gate that passed, which is the
 * wrong direction for loot to fail in: a mob that should arm one time in twenty
 * arms every time. Bedrock's tables are the live example, because they spell
 * conditions as a plural `conditions` array that this package's Java grammar
 * has no case for, and handing one over used to produce no complaint at all.
 */

/** What one level of the grammar does with the keys it meets. */
export interface LootKeySet {
    /** Keys the parser acts on. */
    readonly read: readonly string[];
    /**
     * Keys this package recognizes and reads no further, each naming what goes
     * unapplied. These report a warning rather than an error, because what they
     * change about a result is known and bounded.
     */
    readonly skipped?: Readonly<Record<string, string>>;
}

/**
 * Reports every key at one level that nothing in the grammar reads.
 *
 * This is the whole of what stops the next silent mismatch. A key the parser
 * has no case for changes the file's meaning and not the roll, and a
 * `conditions` array sitting unread beside a pool is indistinguishable from a
 * pool with no gate at all. An unknown key is an error because its effect is
 * unknown. A key this package names and leaves alone is a warning, because its
 * effect is not.
 *
 * @param value - The JSON object at this level.
 * @param keys - What the level's parser reads and knowingly skips.
 * @param level - How the level is named in the report, such as `pool` or `item entry`.
 */
export const reportUnreadKeys = (
    value: JsonObject,
    keys: LootKeySet,
    context: ParseContext,
    level: string
): void => {
    for (const key of Object.keys(value)) {
        if (keys.read.includes(key)) continue;

        const unapplied = keys.skipped?.[key];
        if (unapplied !== undefined) {
            context.at(key).warn(`this package reads no ${key} on a loot ${level}, so ${unapplied} is lost`);
            continue;
        }

        context.at(key).error(`the loot ${level} grammar has no ${key} member, so nothing reads it`);
    }
};

/** Every level of the grammar, with the entry levels keyed by the entry's own type. */
interface GrammarKeys {
    readonly table: LootKeySet;
    readonly pool: LootKeySet;
    /** Keys every entry may carry, whatever its type. */
    readonly entry: LootKeySet;
    /** Keys one entry type adds to {@link GrammarKeys.entry}. */
    readonly byEntryType: Readonly<Record<string, LootKeySet>>;
}

const KEYS: GrammarKeys = {
    table: { read: ['type', 'random_sequence', 'pools', 'modifier'] },
    pool: { read: ['condition', 'modifier', 'rolls', 'bonus_rolls', 'entries'] },
    entry: { read: ['type', 'weight', 'quality', 'condition', 'modifier'] },
    byEntryType: {
        empty: { read: [] },
        item: { read: ['name'] },
        loot_table: { read: ['value', 'expand'] },
        dynamic: { read: ['name'] },
        tag: { read: ['items', 'expand'] },
        slots: { read: ['slot_source'] },
        alternatives: { read: ['children'] },
        sequence: { read: ['children'] },
        group: { read: ['children'] }
    }
};

/** Reports the keys of a table that the table grammar does not read. */
export const reportTableKeys = (value: JsonObject, context: ParseContext): void =>
    reportUnreadKeys(value, KEYS.table, context, 'table');

/** Reports the keys of a pool that the pool grammar does not read. */
export const reportPoolKeys = (value: JsonObject, context: ParseContext): void =>
    reportUnreadKeys(value, KEYS.pool, context, 'pool');

/**
 * Reports the keys of one entry that the entry grammar does not read, against
 * the union of what every entry may carry and what its own type adds.
 *
 * @param type - The entry's `type`, without the namespace.
 */
export const reportEntryKeys = (value: JsonObject, context: ParseContext, type: string): void => {
    const own = KEYS.byEntryType[type];

    reportUnreadKeys(
        value,
        {
            read: own === undefined ? KEYS.entry.read : [...KEYS.entry.read, ...own.read],
            skipped: { ...KEYS.entry.skipped, ...own?.skipped }
        },
        context,
        `${type} entry`
    );
};

/** A gate that never opens, which is what an unreadable condition compiles to. */
const CLOSED: Predicate = () => false;

/** Whether anything reported an error from `from` onwards, without copying the list. */
const erroredSince = (diagnostics: DiagnosticCollector, from: number): boolean => {
    for (let index = from; index < diagnostics.entries.length; index += 1) {
        if (diagnostics.entries[index]?.severity === 'error') return true;
    }
    return false;
};

/**
 * Compiles a condition field so that a condition the grammar cannot read
 * refuses instead of passing.
 *
 * Java folds a composed `condition` field with and, and a term it fails to
 * compile drops out of the fold, which leaves the remaining terms deciding a
 * gate the author wrote more conditions for. A field holding nothing but an
 * unimplemented condition folds to an empty and, which passes. For loot that is
 * the wrong direction to fail in, so any error raised while compiling the field
 * closes the gate for good. The error itself is already in the collector, which
 * is what makes the refusal explainable rather than mysterious.
 *
 * @param value - The `condition` member, absent when the level carries no gate.
 * @returns A predicate that passes only when every term the author wrote was both read and met.
 */
export const gateAt = (value: unknown, context: ParseContext): Predicate => {
    const before = context.diagnostics.entries.length;
    const gate = predicateAt(value, context);

    return erroredSince(context.diagnostics, before) ? CLOSED : gate;
};
