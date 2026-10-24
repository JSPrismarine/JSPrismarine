import type {
    ContextParameterSetName,
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
    predicateAt,
    resolveMembers,
    rootContext
} from '@jsprismarine/predicates';

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

/** Everything {@link parseLootTable} can be told, plus the id the table is registered under. */
export interface LootParseOptions extends ParseOptions {
    /**
     * The namespaced id this table is registered under. Setting it makes a
     * reference that leads back here report a cycle instead of expanding the
     * table one more time.
     */
    id?: string;
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

type EntryParser = (value: JsonObject, context: ParseContext) => LootEntryContainer;

const ENTRIES: Readonly<Record<LootEntryType, EntryParser>> = {
    empty: (value) => single({ weight: uniformWeight(value), produce: () => undefined }),

    item: (value, context) => {
        const name = asString(value['name']);
        if (name === undefined) {
            context.at('name').error('an item entry needs an item id');
            return NOTHING;
        }
        const id = namespaced(name);
        return single({
            weight: uniformWeight(value),
            produce: (emit, evaluation) => emit(evaluation.context.items.create(id, 1))
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

    loot_table: (value, context) => {
        if (value['value'] === undefined) {
            context.at('value').error('a loot_table entry needs a value');
            return NOTHING;
        }

        // A composition that resolves to nothing has already reported why.
        const tables = parseComposed(value['value'], 'loot_table', context.at('value'), (inline, inner) =>
            tableAt(inline, inner)
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

    group: (value, context) => {
        const children = childrenAt(value, context, 'group');
        return (emit, evaluation) => {
            for (const child of children) child(emit, evaluation);
            return true;
        };
    },

    alternatives: (value, context) => {
        const children = childrenAt(value, context, 'alternatives');
        return (emit, evaluation) => children.some((child) => child(emit, evaluation));
    },

    sequence: (value, context) => {
        const children = childrenAt(value, context, 'sequence');
        return (emit, evaluation) => children.every((child) => child(emit, evaluation));
    }
};

const childrenAt = (value: JsonObject, context: ParseContext, type: LootEntryType): readonly LootEntryContainer[] => {
    const at = context.at('children');
    const children = asList(value['children']).map((child, index) => containerAt(child, at.at(index)));
    if (children.length === 0) context.error(`a ${type} entry needs at least one child`);
    return children;
};

const isEntryType = (name: string): name is LootEntryType => LOOT_ENTRY_TYPES.some((known) => known === name);

/** Compiles one entry container: its condition gate, its modifier, and its type-specific body. */
const containerAt = (value: unknown, context: ParseContext): LootEntryContainer => {
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

    const condition = predicateAt(value['condition'], context.at('condition'));
    const modifier =
        value['modifier'] === undefined ? undefined : modifierAt(value['modifier'], context.at('modifier'));
    const body = ENTRIES[name](value, context);

    return (emit, evaluation) => {
        if (!condition(evaluation.context)) return false;
        if (modifier === undefined) return body(emit, evaluation);
        return body((entry) => emit(withModifier(entry, modifier)), evaluation);
    };
};

const poolAt = (value: unknown, context: ParseContext): LootPool | undefined => {
    if (!isJsonObject(value)) {
        context.error('a loot pool must be an object');
        return undefined;
    }
    if (value['rolls'] === undefined) context.error('a loot pool needs rolls');
    if (value['entries'] === undefined) context.error('a loot pool needs entries');

    const at = context.at('entries');
    return {
        condition: predicateAt(value['condition'], context.at('condition')),
        modifier: modifierAt(value['modifier'], context.at('modifier')),
        rolls: intProviderAt(value['rolls'], context.at('rolls')),
        bonusRolls: floatProviderAt(value['bonus_rolls'], context.at('bonus_rolls')),
        entries: asList(value['entries']).map((entry, index) => containerAt(entry, at.at(index)))
    };
};

/**
 * Collects the loot tables a table names by id, walking the raw JSON rather
 * than the compiled closures. The registry turns these into the edges of its
 * reference graph.
 */
const referencesIn = (value: unknown): readonly string[] => {
    const found: string[] = [];

    const visitEntry = (entry: unknown): void => {
        if (!isJsonObject(entry)) return;
        if (namespaced(asString(entry['type']) ?? '') === 'minecraft:loot_table') {
            for (const target of asArray(entry['value'])) {
                const id = asString(target);
                if (id !== undefined && !id.startsWith('#')) found.push(namespaced(id));
            }
        }
        for (const child of asList(entry['children'])) visitEntry(child);
    };

    for (const pool of asList(isJsonObject(value) ? value['pools'] : undefined)) {
        if (!isJsonObject(pool)) continue;
        for (const entry of asList(pool['entries'])) visitEntry(entry);
    }

    return [...new Set(found)];
};

/** Compiles a loot table from parsed JSON at a point in an enclosing parse. */
export const tableAt = (value: unknown, context: ParseContext): LootTable => {
    if (!isJsonObject(value)) {
        context.error('a loot table must be an object');
        return EMPTY_TABLE;
    }

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
        pools: asList(value['pools']).flatMap((pool, index) => poolAt(pool, at.at(index)) ?? []),
        modifier: modifierAt(value['modifier'], context.at('modifier')),
        references: referencesIn(value)
    };
};

/**
 * Compiles one loot table file. Parsing never throws: every fault lands in the
 * returned diagnostics and the table rolls to whatever is still well formed.
 */
export const parseLootTable = (value: unknown, options: LootParseOptions = {}): ParseResult<LootTable> => {
    const context = rootContext(options);
    if (options.id !== undefined) context.visiting.add(`loot_table/${namespaced(options.id)}`);
    return { value: tableAt(value, context), diagnostics: context.diagnostics.entries };
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

const rollPool = (pool: LootPool, evaluation: LootEvaluation, emit: StackSink): void => {
    if (!pool.condition(evaluation.context)) return;

    const sink = applyModifier(emit, pool.modifier, evaluation);
    const bonus = Math.floor(Math.fround(pool.bonusRolls(evaluation.context) * evaluation.luck));
    const rolls = pool.rolls(evaluation.context) + bonus;
    for (let roll = 0; roll < rolls; roll += 1) drawOnce(pool, evaluation, sink);
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
