import type {
    ContextParameterSetName,
    Diagnostic,
    ItemModifier,
    ItemStack,
    JsonObject,
    ParseContext,
    ParseOptions,
    ParseResult,
    PredicateContext
} from '@jsprismarine/predicates';
import {
    CONTEXT_PARAMETER_SETS,
    asArray,
    asBoolean,
    asList,
    asNumber,
    asString,
    floatProviderAt,
    intProviderAt,
    isJsonObject,
    modifierAt,
    namespaced,
    parseComposed,
    resolveMembers,
    rootContext
} from '@jsprismarine/predicates';

import type { LootDialect, LootDifficultyView, LootTiers } from './dialect';
import {
    DEFAULT_DIFFICULTY,
    bedrockRange,
    gateAt,
    reportBedrockFunctions,
    reportEntryKeys,
    reportPoolKeys,
    reportTableKeys,
    tiersAt
} from './dialect';
import type {
    DynamicDropSource,
    LootEntry,
    LootEntryContainer,
    LootEvaluation,
    LootPool,
    LootTable,
    SlotSourceView,
    StackSink
} from './model';

/**
 * The loot table grammar of Java 26.3: a table of pools, a pool of entry
 * containers, and a container of candidates. Parsing turns the JSON into
 * closures once; rolling walks the closures.
 *
 * Bedrock's older spelling of the same grammar is parsed too, behind
 * {@link LootParseOptions.dialect}. See `./dialect.ts` for what differs.
 */

/** The nine `loot_pool_entry_type` members Java 26.3 registers. */
export const LOOT_ENTRY_TYPES = [
    'empty',
    'item',
    'loot_table',
    'dynamic',
    'tag',
    'slots',
    'alternatives',
    'sequence',
    'group'
] as const;

/** One of {@link LOOT_ENTRY_TYPES}. */
export type LootEntryType = (typeof LOOT_ENTRY_TYPES)[number];

/** What a parsed table does with the stacks it drew. */
export interface RollOptions {
    /** Java's luck, which scales each entry's `quality` into its weight. Defaults to 0. */
    readonly luck?: number;
    /**
     * Split each result down to the item's maximum stack size, which is what
     * Java's public roll does and its raw roll does not. Defaults to true.
     */
    readonly split?: boolean;
    readonly dynamic?: DynamicDropSource;
    readonly slots?: SlotSourceView;
}

/** What the table grammar carries down the parse beside the {@link ParseContext}. */
export interface LootGrammar {
    /** Which edition's spelling the file uses. */
    readonly dialect: LootDialect;
    /** What Bedrock's two difficulty-scaled conditions read. */
    readonly difficulty: LootDifficultyView;
}

/** The grammar a parse uses when the caller names none: Java, as every call did before. */
const JAVA_GRAMMAR: LootGrammar = { dialect: 'java', difficulty: DEFAULT_DIFFICULTY };

/** Everything {@link parseLootTable} can be told, plus the id the table is registered under. */
export interface LootParseOptions extends ParseOptions {
    /**
     * The namespaced id this table is registered under. Setting it makes a
     * reference that leads back here report a cycle instead of expanding the
     * table one more time.
     */
    id?: string;
    /**
     * Which edition's spelling the file uses. Defaults to `java`, which is the
     * grammar the 1447 vanilla datapack tables are written in.
     */
    dialect?: LootDialect;
    /** What Bedrock's two difficulty-scaled conditions read. Defaults to {@link DEFAULT_DIFFICULTY}. */
    difficulty?: LootDifficultyView;
    /**
     * Throw instead of returning a table that reported an error. This is the
     * one exception to the package's rule that parsing never throws, and it
     * exists so a host can refuse to run on a table it cannot evaluate rather
     * than roll a gate it failed to read.
     */
    strict?: boolean;
}

/** Reads the grammar out of parse options, defaulting every member to Java's. */
const grammarOf = (options: Pick<LootParseOptions, 'dialect' | 'difficulty'>): LootGrammar => ({
    dialect: options.dialect ?? JAVA_GRAMMAR.dialect,
    difficulty: options.difficulty ?? JAVA_GRAMMAR.difficulty
});

/**
 * Thrown by a strict parse, naming every error the table reported.
 *
 * @see {@link LootParseOptions.strict}
 */
export class LootGrammarError extends Error {
    /** The errors that stopped the parse, in the order they were reported. */
    public readonly diagnostics: readonly Diagnostic[];

    public constructor(diagnostics: readonly Diagnostic[]) {
        const listed = diagnostics.map((entry) => `${entry.path || '<root>'}: ${entry.message}`).join('; ');
        super(`the loot table reported ${diagnostics.length} grammar error(s): ${listed}`);
        this.name = 'LootGrammarError';
        this.diagnostics = diagnostics;
    }
}

const EMPTY_MODIFIER: ItemModifier = (stack) => stack;

const EMPTY_TABLE: LootTable = {
    parameterSet: 'generic',
    randomSequence: undefined,
    pools: [],
    modifier: EMPTY_MODIFIER,
    references: []
};

const NOTHING: LootEntryContainer = () => false;

const isParameterSetName = (name: string): name is ContextParameterSetName => name in CONTEXT_PARAMETER_SETS;

/** Applies one modifier on the way out, dropping the stack when the modifier discards it. */
const applyModifier = (emit: StackSink, modifier: ItemModifier, evaluation: LootEvaluation): StackSink => {
    return (stack) => {
        const result = modifier(stack, evaluation.context);
        if (result !== undefined) emit(result);
    };
};

const withModifier = (entry: LootEntry, modifier: ItemModifier): LootEntry => ({
    weight: (luck) => entry.weight(luck),
    produce: (emit, evaluation) => entry.produce(applyModifier(emit, modifier, evaluation), evaluation)
});

/**
 * Java's `UniformContainerBase.EntryBase.getWeight`: float arithmetic, floored
 * to an integer, clamped at zero. The float rounding matters, because a
 * `quality` scaled by a fractional luck can land either side of an integer.
 */
const uniformWeight = (value: JsonObject): ((luck: number) => number) => {
    const weight = asNumber(value['weight']) ?? 1;
    const quality = asNumber(value['quality']) ?? 0;
    if (quality === 0) {
        const fixed = Math.max(Math.floor(weight), 0);
        return () => fixed;
    }
    return (luck) => Math.max(Math.floor(Math.fround(weight + Math.fround(quality * luck))), 0);
};

/** Wraps one always-available candidate in the container shape the pool reads. */
const single =
    (entry: LootEntry): LootEntryContainer =>
    (emit) => {
        emit(entry);
        return true;
    };

/** Reports a seam the host did not bind, which makes the entry produce nothing. */
const unbound = (context: PredicateContext, path: string, what: string): void => {
    context.diagnostics.warn(path, `no ${what} is bound to this roll`);
};

type EntryParser = (value: JsonObject, context: ParseContext, grammar: LootGrammar) => LootEntryContainer;

const ENTRIES: Readonly<Record<LootEntryType, EntryParser>> = {
    empty: (value) => single({ weight: uniformWeight(value), produce: () => undefined }),

    item: (value, context, grammar) => {
        const name = asString(value['name']);
        if (name === undefined) {
            context.at('name').error('an item entry needs an item id');
            return NOTHING;
        }
        const id = namespaced(name);

        // Java states a stack count with a `set_count` function, so an item
        // entry on its own always produces one. Bedrock states it on the entry.
        const count =
            grammar.dialect === 'bedrock' && value['count'] !== undefined
                ? rangeAt(value['count'], context.at('count'), grammar)
                : undefined;

        if (count === undefined) {
            return single({
                weight: uniformWeight(value),
                produce: (emit, evaluation) => emit(evaluation.context.items.create(id, 1))
            });
        }

        return single({
            weight: uniformWeight(value),
            produce: (emit, evaluation) => {
                // `{ "min": 0, "max": 1 }` is how 181 Bedrock entries say the
                // item is sometimes not there at all, so a count that rolls
                // nothing produces nothing rather than a stack of zero.
                const rolled = Math.trunc(count(evaluation.context));
                if (rolled > 0) emit(evaluation.context.items.create(id, rolled));
            }
        });
    },

    tag: (value, context) => {
        const members = resolveMembers(value['items'], 'item', context.at('items'));
        const ids = [...members.ids];
        if (ids.length === 0) {
            context.at('items').error('a tag entry resolved to no items');
            return NOTHING;
        }

        const weight = uniformWeight(value);
        const produceOne =
            (id: string): LootEntry['produce'] =>
            (emit, evaluation) =>
                emit(evaluation.context.items.create(id, 1));

        if (asBoolean(value['expand']) ?? false) {
            const candidates = ids.map((id) => ({ weight, produce: produceOne(id) }));
            return (emit) => {
                for (const candidate of candidates) emit(candidate);
                return true;
            };
        }

        return single({
            weight,
            produce: (emit, evaluation) => {
                for (const id of ids) emit(evaluation.context.items.create(id, 1));
            }
        });
    },

    loot_table: (value, context, grammar) => {
        if (grammar.dialect === 'bedrock') return bedrockTableEntry(value, context, grammar);

        if (value['value'] === undefined) {
            context.at('value').error('a loot_table entry needs a value');
            return NOTHING;
        }

        // A composition that resolves to nothing has already reported why.
        const tables = parseComposed(value['value'], 'loot_table', context.at('value'), (inline, inner) =>
            tableAt(inline, inner, grammar)
        );
        if (tables.length === 0) return NOTHING;

        const weight = uniformWeight(value);
        if (asBoolean(value['expand']) ?? false) {
            const candidates = tables.map((table) => ({
                weight,
                produce: (emit: StackSink, evaluation: LootEvaluation) => rollInto(table, evaluation, emit)
            }));
            return (emit) => {
                for (const candidate of candidates) emit(candidate);
                return true;
            };
        }

        return single({
            weight,
            produce: (emit, evaluation) => {
                for (const table of tables) rollInto(table, evaluation, emit);
            }
        });
    },

    dynamic: (value, context) => {
        const name = asString(value['name']);
        if (name === undefined) {
            context.at('name').error('a dynamic entry needs a name');
            return NOTHING;
        }
        const id = namespaced(name);
        const path = context.path;
        return single({
            weight: uniformWeight(value),
            produce: (emit, evaluation) => {
                const drops = evaluation.dynamic?.(id, evaluation.context);
                if (drops === undefined) {
                    unbound(evaluation.context, path, `dynamic drop source for ${id}`);
                    return;
                }
                for (const stack of drops) emit(stack);
            }
        });
    },

    slots: (value, context) => {
        const source = value['slot_source'];
        if (source === undefined) {
            context.at('slot_source').error('a slots entry needs a slot_source');
            return NOTHING;
        }
        const path = context.path;
        return single({
            weight: uniformWeight(value),
            produce: (emit, evaluation) => {
                const stacks = evaluation.slots?.(source, evaluation.context);
                if (stacks === undefined) {
                    unbound(evaluation.context, path, 'slot source view');
                    return;
                }
                for (const stack of stacks) emit(stack);
            }
        });
    },

    group: (value, context, grammar) => {
        const children = childrenAt(value, context, 'group', grammar);
        return (emit, evaluation) => {
            for (const child of children) child(emit, evaluation);
            return true;
        };
    },

    alternatives: (value, context, grammar) => {
        const children = childrenAt(value, context, 'alternatives', grammar);
        return (emit, evaluation) => children.some((child) => child(emit, evaluation));
    },

    sequence: (value, context, grammar) => {
        const children = childrenAt(value, context, 'sequence', grammar);
        return (emit, evaluation) => children.every((child) => child(emit, evaluation));
    }
};

/**
 * A Bedrock `loot_table` entry, which names its target by the pack-relative
 * path the behavior pack registry keys tables under: `armor_set_leather.json`
 * rather than `minecraft:armor_set_leather`. Java's composition rule does not
 * apply, because a Bedrock entry names exactly one table and never inlines it.
 */
const bedrockTableEntry = (value: JsonObject, context: ParseContext, grammar: LootGrammar): LootEntryContainer => {
    const at = context.at('name');
    const name = asString(value['name']);
    if (name === undefined) {
        at.error('a bedrock loot_table entry needs a name');
        return NOTHING;
    }

    const key = `loot_table/${name}`;
    if (context.visiting.has(key)) {
        at.error(`loot_table reference ${name} is cyclic`);
        return NOTHING;
    }

    const resolve = context.resolver?.element;
    if (resolve === undefined) {
        at.error(`cannot resolve ${name}: the parse options carry no element resolver`);
        return NOTHING;
    }

    // The registry keys a behavior pack's tables by their pack-relative path,
    // extension included, and vanilla writes the reference both ways: the
    // equipment tables name `armor_set_leather.json` where `guardian.json`
    // names `loot_tables/gameplay/fishing/fish`. The engine reads both.
    const element =
        resolve('loot_table', name) ?? (name.endsWith('.json') ? undefined : resolve('loot_table', `${name}.json`));
    if (element === undefined) {
        at.error(`unknown loot_table ${name}`);
        return NOTHING;
    }

    context.visiting.add(key);
    let table: LootTable;
    try {
        table = tableAt(element, context.atReference(name), grammar);
    } finally {
        context.visiting.delete(key);
    }

    return single({
        weight: uniformWeight(value),
        produce: (emit, evaluation) => rollInto(table, evaluation, emit)
    });
};

const childrenAt = (
    value: JsonObject,
    context: ParseContext,
    type: LootEntryType,
    grammar: LootGrammar
): readonly LootEntryContainer[] => {
    const at = context.at('children');
    const children = asList(value['children']).map((child, index) => containerAt(child, at.at(index), grammar));
    if (children.length === 0) context.error(`a ${type} entry needs at least one child`);
    return children;
};

const isEntryType = (name: string): name is LootEntryType => LOOT_ENTRY_TYPES.some((known) => known === name);

/**
 * Adds the pools a Bedrock entry nests under itself, which roll once the entry
 * is drawn.
 *
 * This is how the armor sets cascade: `armor_set_leather.json` rolls a helmet,
 * and the helmet entry's own pool rolls the chestplate at the difficulty's
 * chance, and that one's rolls the leggings. The nested pools sit outside the
 * entry's modifier, because they produce separate items carrying modifiers of
 * their own.
 */
const withNestedPools = (entry: LootEntry, pools: readonly LootPool[]): LootEntry => ({
    weight: (luck) => entry.weight(luck),
    produce: (emit, evaluation) => {
        entry.produce(emit, evaluation);
        for (const pool of pools) rollPool(pool, evaluation, emit);
    }
});

/** Compiles one entry container: its condition gate, its modifier, and its type-specific body. */
const containerAt = (value: unknown, context: ParseContext, grammar: LootGrammar): LootEntryContainer => {
    if (!isJsonObject(value)) {
        context.error('a loot pool entry must be an object');
        return NOTHING;
    }

    const declared = asString(value['type']);
    if (declared === undefined) {
        context.error('a loot pool entry needs a type');
        return NOTHING;
    }

    const id = namespaced(declared);
    const name = id.slice('minecraft:'.length);
    if (!isEntryType(name)) {
        context.error(`unknown loot pool entry type ${id}`);
        return NOTHING;
    }

    reportEntryKeys(value, context, grammar.dialect, name);
    if (grammar.dialect === 'bedrock') reportBedrockFunctions(value['functions'], context.at('functions'));

    const gateKey = grammar.dialect === 'bedrock' ? 'conditions' : 'condition';
    const condition = gateAt(value[gateKey], context.at(gateKey), grammar.dialect, grammar.difficulty);
    const modifier =
        value['modifier'] === undefined ? undefined : modifierAt(value['modifier'], context.at('modifier'));
    const body = ENTRIES[name](value, context, grammar);

    const at = context.at('pools');
    const nested =
        grammar.dialect === 'bedrock'
            ? asList(value['pools']).flatMap((pool, index) => poolAt(pool, at.at(index), grammar) ?? [])
            : [];

    return (emit, evaluation) => {
        if (!condition(evaluation.context)) return false;

        const offer = (entry: LootEntry): void => emit(nested.length === 0 ? entry : withNestedPools(entry, nested));
        if (modifier === undefined) return body(offer, evaluation);
        return body((entry) => offer(withModifier(entry, modifier)), evaluation);
    };
};

/**
 * Compiles a bare list of entry containers, which is the `entries` field a
 * `set_contents` modifier carries. It is the only place the entry grammar
 * appears outside a pool.
 */
export const parseLootEntries = (
    value: unknown,
    options: ParseOptions & Pick<LootParseOptions, 'dialect' | 'difficulty'> = {}
): ParseResult<readonly LootEntryContainer[]> => {
    const context = rootContext(options);
    const grammar = grammarOf(options);
    const containers = asList(value).map((entry, index) => containerAt(entry, context.at(index), grammar));
    return { value: containers, diagnostics: context.diagnostics.entries };
};

/**
 * Produces every stack a bare entry list offers. Unlike a pool, nothing is
 * weighed or drawn: Java's `set_contents` takes all of them.
 */
export const produceEntries = (
    containers: readonly LootEntryContainer[],
    evaluation: LootEvaluation
): readonly ItemStack[] => {
    const drawn: ItemStack[] = [];
    for (const container of containers) {
        container((entry) => entry.produce((stack) => drawn.push(stack), evaluation), evaluation);
    }
    return drawn;
};

const poolAt = (value: unknown, context: ParseContext, grammar: LootGrammar): LootPool | undefined => {
    if (!isJsonObject(value)) {
        context.error('a loot pool must be an object');
        return undefined;
    }

    reportPoolKeys(value, context, grammar.dialect);

    // `armor_stand.json` and `boat.json` each hold one pool written `{}`,
    // which is a table that deliberately produces nothing: both entities drop
    // themselves through engine code rather than through loot. A pool with no
    // members at all says exactly that, so it is read as empty rather than
    // reported twice as a pool missing its rolls and its entries.
    if (grammar.dialect === 'bedrock' && Object.keys(value).length === 0) return EMPTY_POOL;

    // A tiered pool draws one rung once and states no `rolls`, which is how
    // all ten of Bedrock's are written.
    const tiers = grammar.dialect === 'bedrock' ? tiersAt(value['tiers'], context.at('tiers')) : undefined;
    if (value['rolls'] === undefined && tiers === undefined) context.error('a loot pool needs rolls');
    if (value['entries'] === undefined) context.error('a loot pool needs entries');

    const gateKey = grammar.dialect === 'bedrock' ? 'conditions' : 'condition';
    const at = context.at('entries');

    return {
        condition: gateAt(value[gateKey], context.at(gateKey), grammar.dialect, grammar.difficulty),
        modifier: modifierAt(value['modifier'], context.at('modifier')),
        rolls: tiers === undefined ? rangeAt(value['rolls'], context.at('rolls'), grammar) : ONE_ROLL,
        bonusRolls: floatProviderAt(dialectRange(value['bonus_rolls'], grammar), context.at('bonus_rolls')),
        entries: asList(value['entries']).map((entry, index) => containerAt(entry, at.at(index), grammar)),
        tiers
    };
};

/** The single draw a tiered pool makes, standing in for the `rolls` it does not state. */
const ONE_ROLL = (): number => 1;

/** A pool with nothing to draw from, which is what a Bedrock `{}` pool states. */
const EMPTY_POOL: LootPool = {
    condition: () => true,
    modifier: EMPTY_MODIFIER,
    rolls: () => 0,
    bonusRolls: () => 0,
    entries: [],
    tiers: undefined
};

/**
 * A range member as the shared provider grammar wants it. Java's spelling is
 * already that; Bedrock's untyped `{ min, max }` goes through
 * {@link bedrockRange} first.
 */
const dialectRange = (value: unknown, grammar: LootGrammar): unknown =>
    grammar.dialect === 'bedrock' ? bedrockRange(value) : value;

/** Parses a whole-number range in the dialect's own spelling. */
const rangeAt = (value: unknown, context: ParseContext, grammar: LootGrammar) =>
    intProviderAt(dialectRange(value, grammar), context);

/**
 * Collects the loot tables a table names by id, walking the raw JSON rather
 * than the compiled closures. The registry turns these into the edges of its
 * reference graph, which is how it reports a cycle without compiling
 * anything.
 */
export const lootTableReferences = (value: unknown, dialect: LootDialect = 'java'): readonly string[] => {
    const found: string[] = [];

    const visitEntry = (entry: unknown): void => {
        if (!isJsonObject(entry)) return;
        if (namespaced(asString(entry['type']) ?? '') === 'minecraft:loot_table') {
            if (dialect === 'bedrock') {
                // A Bedrock entry names one table by its pack-relative path,
                // which is already the key the registry holds it under.
                const path = asString(entry['name']);
                if (path !== undefined) found.push(path);
            } else {
                for (const target of asArray(entry['value'])) {
                    const id = asString(target);
                    if (id !== undefined && !id.startsWith('#')) found.push(namespaced(id));
                }
            }
        }
        for (const child of asList(entry['children'])) visitEntry(child);
        for (const pool of asList(entry['pools'])) visitPool(pool);
    };

    const visitPool = (pool: unknown): void => {
        if (!isJsonObject(pool)) return;
        for (const entry of asList(pool['entries'])) visitEntry(entry);
    };

    for (const pool of asList(isJsonObject(value) ? value['pools'] : undefined)) visitPool(pool);

    return [...new Set(found)];
};

/** Compiles a loot table from parsed JSON at a point in an enclosing parse. */
export const tableAt = (value: unknown, context: ParseContext, grammar: LootGrammar = JAVA_GRAMMAR): LootTable => {
    if (!isJsonObject(value)) {
        context.error('a loot table must be an object');
        return EMPTY_TABLE;
    }

    reportTableKeys(value, context, grammar.dialect);

    let parameterSet: ContextParameterSetName = 'generic';
    const declared = asString(value['type']);
    if (declared !== undefined) {
        const id = namespaced(declared);
        const name = id.slice('minecraft:'.length);
        if (isParameterSetName(name)) parameterSet = name;
        else context.at('type').error(`unknown loot context key set ${id}`);
    }

    const sequence = asString(value['random_sequence']);
    const at = context.at('pools');

    return {
        parameterSet,
        randomSequence: sequence === undefined ? undefined : namespaced(sequence),
        pools: asList(value['pools']).flatMap((pool, index) => poolAt(pool, at.at(index), grammar) ?? []),
        modifier: modifierAt(value['modifier'], context.at('modifier')),
        references: lootTableReferences(value, grammar.dialect)
    };
};

/**
 * Compiles one loot table file. Parsing never throws unless
 * {@link LootParseOptions.strict} says so: every fault lands in the returned
 * diagnostics and the table rolls to whatever is still well formed.
 *
 * @throws {LootGrammarError} In strict mode, when the table reported an error.
 */
export const parseLootTable = (value: unknown, options: LootParseOptions = {}): ParseResult<LootTable> => {
    const context = rootContext(options);
    const grammar = grammarOf(options);

    if (options.id !== undefined) {
        // Bedrock keys a table by its pack-relative path, which carries no
        // namespace and must not be given one.
        context.visiting.add(`loot_table/${grammar.dialect === 'bedrock' ? options.id : namespaced(options.id)}`);
    }

    const before = context.diagnostics.entries.length;
    const table = tableAt(value, context, grammar);

    if (options.strict) {
        const raised = context.diagnostics.entries.slice(before).filter((entry) => entry.severity === 'error');
        if (raised.length > 0) throw new LootGrammarError(raised);
    }

    return { value: table, diagnostics: context.diagnostics.entries };
};

/** Java's `LootPool.addRandomItem`: weigh the candidates, then draw one. */
const drawOnce = (pool: LootPool, evaluation: LootEvaluation, emit: StackSink): void => {
    const candidates: LootEntry[] = [];
    let total = 0;

    for (const container of pool.entries) {
        container((entry) => {
            const weight = entry.weight(evaluation.luck);
            if (weight > 0) {
                candidates.push(entry);
                total += weight;
            }
        }, evaluation);
    }

    if (total === 0 || candidates.length === 0) return;
    if (candidates.length === 1) {
        candidates[0]!.produce(emit, evaluation);
        return;
    }

    let roll = evaluation.context.random.nextInt(total);
    for (const candidate of candidates) {
        roll -= candidate.weight(evaluation.luck);
        if (roll < 0) {
            candidate.produce(emit, evaluation);
            return;
        }
    }
};

/**
 * Bedrock's tiered draw, which is Java's `Mob.populateArmor` written as data:
 * land somewhere in the opening range, then climb one rung per bonus roll that
 * hits. Weight plays no part, because the ladder is the order the entries are
 * written in.
 */
const drawTier = (pool: LootPool, tiers: LootTiers, evaluation: LootEvaluation, emit: StackSink): void => {
    const candidates: LootEntry[] = [];
    for (const container of pool.entries) container((entry) => candidates.push(entry), evaluation);
    if (candidates.length === 0) return;

    const random = evaluation.context.random;
    let rung = random.nextInt(Math.min(tiers.initialRange, candidates.length));
    for (let bonus = 0; bonus < tiers.bonusRolls; bonus += 1) {
        if (random.nextFloat() < tiers.bonusChance) rung += 1;
    }

    candidates[Math.min(rung, candidates.length - 1)]?.produce(emit, evaluation);
};

const rollPool = (pool: LootPool, evaluation: LootEvaluation, emit: StackSink): void => {
    if (!pool.condition(evaluation.context)) return;

    const sink = applyModifier(emit, pool.modifier, evaluation);
    const bonus = Math.floor(Math.fround(pool.bonusRolls(evaluation.context) * evaluation.luck));
    const rolls = pool.rolls(evaluation.context) + bonus;
    const tiers = pool.tiers;
    for (let roll = 0; roll < rolls; roll += 1) {
        if (tiers === undefined) drawOnce(pool, evaluation, sink);
        else drawTier(pool, tiers, evaluation, sink);
    }
};

/** Java's `LootTable.getRandomItemsRaw`: every pool, through the table modifier, unsplit. */
export const rollInto = (table: LootTable, evaluation: LootEvaluation, emit: StackSink): void => {
    const sink = applyModifier(emit, table.modifier, evaluation);
    for (const pool of table.pools) rollPool(pool, evaluation, sink);
};

/** Java's stack splitter: a result above the item's maximum becomes whole stacks plus a remainder. */
const splitStacks = (stacks: readonly ItemStack[], context: PredicateContext): readonly ItemStack[] =>
    stacks.flatMap((stack) => {
        const limit = context.items.maxStackSize(stack);
        if (stack.count < limit) return [stack];

        const parts: ItemStack[] = [];
        let left = stack.count;
        while (left > 0) {
            const taken = Math.min(limit, left);
            parts.push(context.items.withCount(stack, taken));
            left -= taken;
        }
        return parts;
    });

/**
 * Rolls a table once, in Java's order: every pool in turn, the rolled number
 * of draws each, one weighted candidate per draw, and each stack through the
 * entry modifier, then the pool modifier, then the table modifier.
 *
 * The randomness is the context's, so a seeded source reproduces the draw. Use
 * {@link lootSequenceRandom} to build the stream Java's `random_sequence`
 * gives this table for a world seed.
 */
export const rollLootTable = (
    table: LootTable,
    context: PredicateContext,
    options: RollOptions = {}
): readonly ItemStack[] => {
    if (context.parameterSet !== table.parameterSet) {
        context.diagnostics.error(
            '',
            `the table declares the ${table.parameterSet} loot context but the roll supplied ${context.parameterSet}`
        );
    }

    const drawn: ItemStack[] = [];
    rollInto(table, { context, luck: options.luck ?? 0, dynamic: options.dynamic, slots: options.slots }, (stack) =>
        drawn.push(stack)
    );
    return options.split === false ? drawn : splitStacks(drawn, context);
};
