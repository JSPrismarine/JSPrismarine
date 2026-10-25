import type { DiagnosticCollector, JsonObject, ParseContext, Predicate } from '@jsprismarine/predicates';
import { asNumber, asString, isJsonObject, namespaced, predicateAt } from '@jsprismarine/predicates';

/**
 * The two spellings of the loot table grammar, and the rule that a key nothing
 * reads is reported rather than skipped.
 *
 * Java 26.3 renamed `conditions` to `condition` and `functions` to `modifier`.
 * Bedrock kept the plural arrays and added three members of its own. The two
 * are close enough that a Bedrock table parses as Java without a single
 * complaint, and far enough apart that the result is wrong: a gate nothing
 * reads is a gate that passes, which armed 2000 of 2000 zombies where the
 * table says one in twenty.
 */

/** The spellings {@link LootDialect} covers. */
export const LOOT_DIALECTS = ['java', 'bedrock'] as const;

/** Which edition's spelling a table is written in. */
export type LootDialect = (typeof LOOT_DIALECTS)[number];

/** What one level of one dialect's grammar does with the keys it meets. */
export interface LootKeySet {
    /** Keys the parser acts on. */
    readonly read: readonly string[];
    /**
     * Keys the dialect defines that this package reads no further, each naming
     * what goes unapplied. These report a warning rather than an error, because
     * what they change about a result is known and bounded.
     */
    readonly skipped?: Readonly<Record<string, string>>;
}

/**
 * Reports every key at one level that nothing in the grammar reads.
 *
 * This is the whole of what stops the next dialect mismatch. A key the parser
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
    dialect: LootDialect,
    level: string
): void => {
    for (const key of Object.keys(value)) {
        if (keys.read.includes(key)) continue;

        const unapplied = keys.skipped?.[key];
        if (unapplied !== undefined) {
            context.at(key).warn(`this package reads no ${key} on a ${dialect} loot ${level}, so ${unapplied} is lost`);
            continue;
        }

        context.at(key).error(`the ${dialect} loot ${level} grammar has no ${key} member, so nothing reads it`);
    }
};

/** Every level of one dialect, with the entry levels keyed by the entry's own type. */
interface DialectKeys {
    readonly table: LootKeySet;
    readonly pool: LootKeySet;
    /** Keys every entry may carry, whatever its type. */
    readonly entry: LootKeySet;
    /** Keys one entry type adds to {@link DialectKeys.entry}. */
    readonly byEntryType: Readonly<Record<string, LootKeySet>>;
}

const JAVA_KEYS: DialectKeys = {
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

const BEDROCK_KEYS: DialectKeys = {
    table: { read: ['type', 'pools'] },
    pool: { read: ['conditions', 'rolls', 'bonus_rolls', 'tiers', 'entries'] },
    entry: {
        read: ['type', 'weight', 'quality', 'conditions', 'pools'],
        skipped: { functions: 'the item functions' }
    },
    byEntryType: {
        empty: { read: [] },
        item: {
            read: ['name'],
            skipped: { count: 'the stack count', aux_val: 'the aux value', auxVal: 'the aux value' }
        },
        loot_table: { read: ['name'] },
        dynamic: { read: ['name'] },
        tag: { read: ['items', 'expand'] },
        slots: { read: ['slot_source'] },
        alternatives: { read: ['children'] },
        sequence: { read: ['children'] },
        group: { read: ['children'] }
    }
};

const KEYS: Readonly<Record<LootDialect, DialectKeys>> = { java: JAVA_KEYS, bedrock: BEDROCK_KEYS };

/** Reports the keys of a table that the dialect's table grammar does not read. */
export const reportTableKeys = (value: JsonObject, context: ParseContext, dialect: LootDialect): void =>
    reportUnreadKeys(value, KEYS[dialect].table, context, dialect, 'table');

/** Reports the keys of a pool that the dialect's pool grammar does not read. */
export const reportPoolKeys = (value: JsonObject, context: ParseContext, dialect: LootDialect): void =>
    reportUnreadKeys(value, KEYS[dialect].pool, context, dialect, 'pool');

/**
 * Reports the keys of one entry that the dialect's entry grammar does not read,
 * against the union of what every entry may carry and what its own type adds.
 *
 * @param type - The entry's `type`, without the namespace.
 */
export const reportEntryKeys = (
    value: JsonObject,
    context: ParseContext,
    dialect: LootDialect,
    type: string
): void => {
    const { entry, byEntryType } = KEYS[dialect];
    const own = byEntryType[type];

    reportUnreadKeys(
        value,
        {
            read: own === undefined ? entry.read : [...entry.read, ...own.read],
            skipped: { ...entry.skipped, ...own?.skipped }
        },
        context,
        dialect,
        `${type} entry`
    );
};

/** Bedrock's four difficulty settings, which `random_difficulty_chance` names a chance for. */
export const BEDROCK_DIFFICULTIES = ['peaceful', 'easy', 'normal', 'hard'] as const;

/** One of {@link BEDROCK_DIFFICULTIES}. */
export type BedrockDifficulty = (typeof BEDROCK_DIFFICULTIES)[number];

/**
 * What Bedrock's two difficulty-scaled conditions read.
 *
 * Both are asked per evaluation rather than captured at parse time, so a world
 * whose difficulty changes takes effect on the next roll instead of on the next
 * reload.
 */
export interface LootDifficultyView {
    /** The world's difficulty setting. */
    level(): BedrockDifficulty;
    /**
     * Bedrock's regional difficulty as a factor between 0 and 1, which scales
     * the `max_chance` of `random_regional_difficulty_chance`. A region at 1
     * rolls the table's stated chance, and a region at 0 rolls nothing.
     */
    scale(): number;
}

/**
 * The difficulty a roll sees when the host binds none: normal, in a fully
 * ramped region.
 *
 * A scale of 1 makes a table's stated `max_chance` its actual chance, so
 * `zombie_equipment.json` arms one zombie in twenty from its `0.05`. The other
 * end of the range, a fresh region at 0, would arm none at all and read as the
 * same silent failure this module exists to stop.
 */
export const DEFAULT_DIFFICULTY: LootDifficultyView = {
    level: () => 'normal',
    scale: () => 1
};

/** A gate that never opens, which is what an unreadable condition compiles to. */
const CLOSED: Predicate = () => false;

/** A gate with nothing to check. */
const OPEN: Predicate = () => true;

/** Whether anything reported an error from `from` onwards, without copying the list. */
const erroredSince = (diagnostics: DiagnosticCollector, from: number): boolean => {
    for (let index = from; index < diagnostics.entries.length; index += 1) {
        if (diagnostics.entries[index]?.severity === 'error') return true;
    }
    return false;
};

type BedrockConditionParser = (value: JsonObject, context: ParseContext, difficulty: LootDifficultyView) => Predicate;

/**
 * The three chance conditions Bedrock's equipment tables gate on. Every other
 * Bedrock condition type is reported by `bedrockConditionAt` and closes its
 * gate, because this package has nothing to evaluate it against.
 */
const BEDROCK_CONDITIONS: Readonly<Record<string, BedrockConditionParser>> = {
    random_chance: (value, context) => {
        const chance = asNumber(value['chance']);
        if (chance === undefined) {
            context.at('chance').error('a random_chance condition needs a chance');
            return CLOSED;
        }
        return (evaluation) => evaluation.random.nextFloat() < chance;
    },

    random_difficulty_chance: (value, context, difficulty) => {
        const fallback = asNumber(value['default_chance']);
        if (fallback === undefined) {
            context.at('default_chance').error('a random_difficulty_chance condition needs a default_chance');
            return CLOSED;
        }

        // The four settings are optional overrides of `default_chance`, and
        // vanilla writes only the ones that differ: `peaceful: 0` on nearly
        // every one, `hard` on the armor cascades.
        const stated = new Map(
            BEDROCK_DIFFICULTIES.flatMap((name) => {
                const chance = asNumber(value[name]);
                return chance === undefined ? [] : [[name, chance] as const];
            })
        );

        return (evaluation) => evaluation.random.nextFloat() < (stated.get(difficulty.level()) ?? fallback);
    },

    random_regional_difficulty_chance: (value, context, difficulty) => {
        const max = asNumber(value['max_chance']);
        if (max === undefined) {
            context.at('max_chance').error('a random_regional_difficulty_chance condition needs a max_chance');
            return CLOSED;
        }
        return (evaluation) => evaluation.random.nextFloat() < max * difficulty.scale();
    }
};

/** The keys each Bedrock condition type reads, so one carrying anything else is reported. */
const BEDROCK_CONDITION_KEYS: Readonly<Record<string, readonly string[]>> = {
    random_chance: ['condition', 'chance'],
    random_difficulty_chance: ['condition', 'default_chance', ...BEDROCK_DIFFICULTIES],
    random_regional_difficulty_chance: ['condition', 'max_chance']
};

/**
 * Compiles one member of a Bedrock `conditions` array, which names its type in
 * a `condition` key where Java uses `type`.
 */
const bedrockConditionAt = (value: unknown, context: ParseContext, difficulty: LootDifficultyView): Predicate => {
    if (!isJsonObject(value)) {
        context.error('a bedrock loot condition must be an object');
        return CLOSED;
    }

    const declared = asString(value['condition']);
    if (declared === undefined) {
        context.error('a bedrock loot condition needs a condition');
        return CLOSED;
    }

    const name = namespaced(declared).slice('minecraft:'.length);
    const parser = BEDROCK_CONDITIONS[name];
    if (parser === undefined) {
        context.error(`this package does not implement the bedrock loot condition ${declared}`);
        return CLOSED;
    }

    reportUnreadKeys(value, { read: BEDROCK_CONDITION_KEYS[name] ?? [] }, context, 'bedrock', `${name} condition`);
    return parser(value, context, difficulty);
};

/**
 * Compiles a condition field so that a condition the grammar cannot read
 * refuses instead of passing.
 *
 * Java folds a composed `condition` field with and, and a term it fails to
 * compile drops out of the fold, which leaves the remaining terms deciding a
 * gate the author wrote more conditions for. For loot that is the wrong
 * direction to fail in, so any error raised while compiling the field closes
 * the gate for good. The error itself is already in the collector, which is
 * what makes the refusal explainable rather than mysterious.
 *
 * @param value - The `condition` or `conditions` member, absent when the level carries no gate.
 * @returns A predicate that passes only when every term the author wrote was both read and met.
 */
export const gateAt = (
    value: unknown,
    context: ParseContext,
    dialect: LootDialect,
    difficulty: LootDifficultyView
): Predicate => {
    const before = context.diagnostics.entries.length;

    let gate: Predicate;
    if (dialect === 'java') {
        gate = predicateAt(value, context);
    } else if (value === undefined) {
        gate = OPEN;
    } else if (!Array.isArray(value)) {
        context.error('a bedrock conditions member must be an array');
        gate = CLOSED;
    } else {
        const terms = value.map((term, index) => bedrockConditionAt(term, context.at(index), difficulty));
        gate = (evaluation) => terms.every((term) => term(evaluation));
    }

    return erroredSince(context.diagnostics, before) ? CLOSED : gate;
};

/**
 * Bedrock's `tiers`: a pool that draws a rung of a ladder rather than a
 * weighted candidate.
 *
 * It reproduces Java's `Mob.populateArmor`, which is why `zombie_equipment`
 * states an initial range of 3 over six armor sets with three bonus rolls at
 * 0.1087. Leather, copper and gold are common, and diamond needs all three
 * bonuses to land.
 */
export interface LootTiers {
    /** How many entries the opening draw may land on, counted from the first. */
    readonly initialRange: number;
    /** How many chances the draw gets to climb one rung. */
    readonly bonusRolls: number;
    /** The chance each bonus roll climbs. */
    readonly bonusChance: number;
}

/** The keys a `tiers` object reads. */
const TIERS_KEYS = ['initial_range', 'bonus_rolls', 'bonus_chance'] as const;

/**
 * Compiles a pool's `tiers` member.
 *
 * @returns The ladder, or undefined for a pool that has none and so draws by weight.
 */
export const tiersAt = (value: unknown, context: ParseContext): LootTiers | undefined => {
    if (value === undefined) return undefined;
    if (!isJsonObject(value)) {
        context.error('a tiers member must be an object');
        return undefined;
    }

    reportUnreadKeys(value, { read: TIERS_KEYS }, context, 'bedrock', 'tiers');

    // `piglin_gear_melee.json` writes `{ "initial_range": 1 }` and nothing
    // else, so the two bonus fields default to a ladder that never climbs.
    return {
        initialRange: Math.max(Math.trunc(asNumber(value['initial_range']) ?? 1), 1),
        bonusRolls: Math.max(Math.trunc(asNumber(value['bonus_rolls']) ?? 0), 0),
        bonusChance: asNumber(value['bonus_chance']) ?? 0
    };
};
