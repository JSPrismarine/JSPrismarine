import type {
    Diagnostic,
    EnchantmentView,
    GrammarExtensions,
    ItemStack,
    ItemStackOps,
    RandomSource,
    ReferenceResolver
} from '@jsprismarine/predicates';
import { DiagnosticCollector } from '@jsprismarine/predicates';

import type { LootContentOptions, LootContextOptions } from './content';
import { createLootContext } from './content';
import type { LootDialect, LootDifficultyView } from './dialect';
import type { DynamicDropSource, LootTable, SlotSourceView } from './model';
import type { LootPackDefinitions } from './packs';
import { createPackResolver, packJson } from './packs';
import { LootSequences } from './random';
import { lootTableReferences, parseLootTable, rollLootTable } from './table';

/**
 * The loot tables of one world: compiled on first use, cross-referenced
 * through the pack stack, and rolled against the world's random sequences.
 */

/** Everything a {@link LootRegistry} needs beyond the pack stack itself. */
export interface LootRegistryOptions {
    /** The world seed that keys every table's `random_sequence`. Defaults to 0. */
    readonly worldSeed?: bigint;
    /**
     * What the content view needs; the registry passes it to every context it
     * builds. Each member the host leaves out that the pack stack can answer
     * is filled in from the stack: see {@link LootRegistry}.
     */
    readonly content?: LootContentOptions;
    /**
     * The enchantment facts `enchant_randomly`, `enchant_with_levels`,
     * `apply_bonus` and `table_bonus` read.
     *
     * A factory rather than a view, because the enchanting table draw
     * `enchant_with_levels` runs has to come out of the same stream as the
     * rest of the roll. The registry calls it with the stream the table drew
     * from, so a seeded roll enchants the same way twice.
     */
    readonly enchantments?: (random: RandomSource) => EnchantmentView;
    /**
     * The per-item limits `set_count`, `limit_count` and the final stack split
     * read. Without it every item stacks to 64, so a roll of 20 ender pearls
     * arrives as one stack instead of the two Bedrock shows.
     */
    readonly items?: ItemStackOps;
    /** Entity sub-predicate and data component predicate types this host adds to the grammar. */
    readonly extensions?: GrammarExtensions;
    /** What Bedrock's two difficulty-scaled conditions read. */
    readonly difficulty?: LootDifficultyView;
    /**
     * Refuse a table that reported an error instead of rolling what is left of
     * it. {@link LootRegistry.table} and {@link LootRegistry.validate} throw a
     * `LootGrammarError` when a table fails to compile cleanly.
     */
    readonly strict?: boolean;
}

/** What one roll through the registry can be told. */
export interface LootRollRequest extends Omit<LootContextOptions, 'content'> {
    /**
     * Split each result down to the item's maximum stack size, which is what
     * Java's public roll does. Defaults to true.
     */
    readonly split?: boolean;
    readonly dynamic?: DynamicDropSource;
    readonly slots?: SlotSourceView;
    /**
     * Replaces the table's own sequenced stream, for a test that wants a
     * scripted draw.
     */
    readonly random?: RandomSource;
}

/** One reference cycle, as the chain that closes it. */
export type LootTableCycle = readonly string[];

/**
 * One finding, with the table that was being compiled when it was reported.
 *
 * A {@link Diagnostic} carries a path inside one file and no file, because the
 * grammar parses files it is handed. The registry is what knows which file, so
 * it is what says: a host restating these in its own report needs the id to
 * find the pack and the path on disk.
 */
export interface LootFinding extends Diagnostic {
    /** The registered id of the table, or the empty string for a finding that belongs to no one table. */
    readonly id: string;
}

/**
 * Finds every cycle in a reference graph, reporting each as the chain from
 * the table that closes it back to itself.
 */
const findCycles = (edges: ReadonlyMap<string, readonly string[]>): readonly LootTableCycle[] => {
    const cycles: LootTableCycle[] = [];
    const seen = new Set<string>();
    const reported = new Set<string>();
    const stack: string[] = [];
    const onStack = new Set<string>();

    const visit = (id: string): void => {
        if (onStack.has(id)) {
            const chain = [...stack.slice(stack.indexOf(id)), id];
            const key = chain.join(' -> ');
            if (!reported.has(key)) {
                reported.add(key);
                cycles.push(chain);
            }
            return;
        }
        if (seen.has(id)) return;

        seen.add(id);
        stack.push(id);
        onStack.add(id);
        for (const target of edges.get(id) ?? []) visit(target);
        stack.pop();
        onStack.delete(id);
    };

    for (const id of edges.keys()) visit(id);
    return cycles;
};

/**
 * The loot tables a pack stack registered.
 *
 * A table compiles on first use and stays compiled, so a chest opened a
 * thousand times parses once. References between tables resolve through the
 * same stack, and a reference that leads back to its own table reports a
 * cycle instead of recursing.
 *
 * Three of the content seams are answered from the stack rather than asked of
 * the host, because the stack already carries what they need:
 * {@link LootContentOptions.recipes} is the stack's own Java recipes, which is
 * what `furnace_smelt` smelts through; {@link LootContentOptions.itemTag}
 * expands an item tag a smelting ingredient names; and
 * {@link LootContentOptions.parse} resolves the references a `set_contents`
 * entry list may name. A host that passes any of them keeps its own.
 */
export class LootRegistry {
    /** Everything parsing and rolling reported, in the order it was reported. */
    public readonly diagnostics = new DiagnosticCollector();

    private readonly definitions: LootPackDefinitions;
    private readonly options: LootRegistryOptions;
    private readonly sequences: LootSequences;
    private readonly resolver: ReferenceResolver;
    private readonly content: LootContentOptions;
    private readonly compiled = new Map<string, LootTable>();
    /** The table each diagnostic belongs to, by the diagnostic's index. */
    private readonly owners: string[] = [];
    private cycleCache: readonly LootTableCycle[] | undefined;
    private validated = false;

    public constructor(definitions: LootPackDefinitions, options: LootRegistryOptions = {}) {
        this.definitions = definitions;
        this.options = options;
        this.sequences = new LootSequences(options.worldSeed ?? 0n);
        this.resolver = createPackResolver(definitions);

        const content = options.content;
        this.content = {
            ...content,
            recipes: content?.recipes ?? definitions.recipesJava,
            itemTag: content?.itemTag ?? ((tag) => this.resolver.tag?.('item', tag)),
            parse: content?.parse ?? { resolver: this.resolver, extensions: options.extensions }
        };
    }

    /** The namespaced ids the pack stack registered, in load order. */
    public get ids(): readonly string[] {
        return [...this.definitions.lootTables.tables.keys()];
    }

    /** Which edition's spelling the registered tables are written in, as the source stated it. */
    public get dialect(): LootDialect {
        return this.definitions.lootTables.dialect;
    }

    /** The world seed every sequenced stream is keyed from. */
    public get worldSeed(): bigint {
        return this.sequences.worldSeed;
    }

    /**
     * Everything reported so far, each attributed to the table it came from.
     *
     * This is {@link diagnostics} for a host that writes its own report, such
     * as one naming the pack and the file a finding sits in. Call
     * {@link validate} first for the whole picture; on its own this holds only
     * what the tables compiled so far reported.
     */
    public get findings(): readonly LootFinding[] {
        return this.diagnostics.entries.map((entry, index) => ({ ...entry, id: this.owners[index] ?? '' }));
    }

    /**
     * Records that everything reported from `from` onwards belongs to `id`.
     *
     * Index-keyed rather than a field on the diagnostic, because the collector
     * is shared with `@jsprismarine/predicates`, which reports against a path
     * inside a file and has no notion of which file.
     */
    private attribute(id: string, from: number): void {
        while (this.owners.length < from) this.owners.push('');
        while (this.owners.length < this.diagnostics.entries.length) this.owners.push(id);
    }

    /**
     * Compiles a table, or returns undefined when the stack has no such id.
     * Parse diagnostics land in {@link diagnostics}.
     *
     * @throws {import('./table').LootGrammarError} In strict mode, when the table reported an error.
     */
    public table(id: string): LootTable | undefined {
        const cached = this.compiled.get(id);
        if (cached !== undefined) return cached;

        const json = packJson(this.definitions.lootTables.tables.get(id));
        if (json === undefined) return undefined;

        const before = this.diagnostics.entries.length;
        const { value } = parseLootTable(json, {
            id,
            path: id,
            diagnostics: this.diagnostics,
            resolver: this.resolver,
            extensions: this.options.extensions,
            dialect: this.dialect,
            difficulty: this.options.difficulty,
            strict: this.options.strict
        });
        this.attribute(id, before);
        this.compiled.set(id, value);
        return value;
    }

    /**
     * Rolls a table by id. The context key set comes from the table and the
     * randomness from the table's own sequence, so the only thing a caller
     * has to supply is the loot context parameters.
     */
    public roll(id: string, request: LootRollRequest = {}): readonly ItemStack[] {
        const table = this.table(id);
        if (table === undefined) {
            const before = this.diagnostics.entries.length;
            this.diagnostics.error(id, `unknown loot table ${id}`);
            this.attribute(id, before);
            return [];
        }

        const { split, dynamic, slots, ...contextOptions } = request;
        const random = request.random ?? this.sequences.forSequence(table.randomSequence);
        const context = createLootContext({
            ...contextOptions,
            parameterSet: request.parameterSet ?? table.parameterSet,
            random,
            diagnostics: request.diagnostics ?? this.diagnostics,
            items: request.items ?? this.options.items,
            // Built from this roll's own stream, so the enchanting table draw
            // `enchant_with_levels` runs replays with the rest of the table.
            enchantments: request.enchantments ?? this.options.enchantments?.(random),
            content: this.content
        });

        return rollLootTable(table, context, { luck: request.luck, split, dynamic, slots });
    }

    /**
     * Every cycle in the reference graph, found over the raw JSON without
     * compiling anything. Computed once and kept.
     */
    public get cycles(): readonly LootTableCycle[] {
        if (this.cycleCache !== undefined) return this.cycleCache;

        const edges = new Map<string, readonly string[]>();
        for (const [id, entry] of this.definitions.lootTables.tables) {
            edges.set(id, lootTableReferences(packJson(entry), this.dialect));
        }
        this.cycleCache = findCycles(edges);
        return this.cycleCache;
    }

    /**
     * Compiles every registered table and walks the reference graph, so a
     * malformed pack fails at load rather than at the first chest.
     *
     * Runs once: a second call answers from what the first reported.
     *
     * @returns Everything reported so far, cycles included. {@link findings}
     *   is the same list with each entry's table named.
     * @throws {import('./table').LootGrammarError} In strict mode, at the first
     *   table that reported an error.
     */
    public validate(): readonly Diagnostic[] {
        if (this.validated) return this.diagnostics.entries;
        this.validated = true;

        for (const chain of this.cycles) {
            const before = this.diagnostics.entries.length;
            this.diagnostics.error(chain[0] ?? '', `loot table reference cycle: ${chain.join(' -> ')}`);
            this.attribute(chain[0] ?? '', before);
        }
        for (const id of this.ids) this.table(id);
        return this.diagnostics.entries;
    }
}
