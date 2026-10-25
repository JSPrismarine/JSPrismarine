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
        return [...this.definitions.lootTablesJava.keys()];
    }

    /** The world seed every sequenced stream is keyed from. */
    public get worldSeed(): bigint {
        return this.sequences.worldSeed;
    }

    /**
     * Compiles a table, or returns undefined when the stack has no such id.
     * Parse diagnostics land in {@link diagnostics}.
     */
    public table(id: string): LootTable | undefined {
        const cached = this.compiled.get(id);
        if (cached !== undefined) return cached;

        const json = packJson(this.definitions.lootTablesJava.get(id));
        if (json === undefined) return undefined;

        const { value } = parseLootTable(json, {
            id,
            path: id,
            diagnostics: this.diagnostics,
            resolver: this.resolver,
            extensions: this.options.extensions
        });
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
            this.diagnostics.error(id, `unknown loot table ${id}`);
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
        for (const [id, entry] of this.definitions.lootTablesJava) {
            edges.set(id, lootTableReferences(packJson(entry)));
        }
        this.cycleCache = findCycles(edges);
        return this.cycleCache;
    }

    /**
     * Compiles every registered table and walks the reference graph, so a
     * malformed pack fails at load rather than at the first chest.
     *
     * @returns Everything reported so far, cycles included.
     */
    public validate(): readonly Diagnostic[] {
        if (this.validated) return this.diagnostics.entries;
        this.validated = true;

        for (const chain of this.cycles) {
            this.diagnostics.error(chain[0] ?? '', `loot table reference cycle: ${chain.join(' -> ')}`);
        }
        for (const id of this.ids) this.table(id);
        return this.diagnostics.entries;
    }
}
