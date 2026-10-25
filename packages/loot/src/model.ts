import type {
    ContextParameterSetName,
    ItemModifier,
    ItemStack,
    NumberProvider,
    Predicate,
    PredicateContext
} from '@jsprismarine/predicates';

import type { LootTiers } from './dialect';

/**
 * The compiled shape of a Java loot table. Parsing happens once; rolling
 * walks closures and never touches JSON again.
 */

/** Receives each stack a roll produces, in the order the pools produce it. */
export type StackSink = (stack: ItemStack) => void;

/**
 * Answers a `dynamic` entry. Java calls these dynamic drops and uses them for
 * the contents a block entity carries into its own drop, such as a shulker
 * box's inventory or a banner's patterns.
 */
export type DynamicDropSource = (name: string, context: PredicateContext) => readonly ItemStack[] | undefined;

/**
 * Answers a `slots` entry. The `slot_source` registry has six types and no
 * vanilla files, and a slot model belongs to the container code rather than
 * here, so this package hands the parsed JSON over and takes the stacks back.
 */
export type SlotSourceView = (source: unknown, context: PredicateContext) => readonly ItemStack[] | undefined;

/**
 * What one roll carries beyond the predicate context: Java's luck, and the
 * two seams the entry grammar needs. Both seams are optional, and an entry
 * that reaches a missing one reports a diagnostic and produces nothing.
 */
export interface LootEvaluation {
    readonly context: PredicateContext;
    /** Java's luck, which scales an entry's `quality` into its weight. */
    readonly luck: number;
    readonly dynamic?: DynamicDropSource;
    readonly slots?: SlotSourceView;
}

/** One candidate a pool can draw, after the container holding it passed its condition. */
export interface LootEntry {
    /** Java's `weight + quality * luck`, floored to an integer and clamped at zero. */
    weight(luck: number): number;
    /** Produces this candidate's stacks, already carrying every modifier on the way out. */
    produce(emit: StackSink, evaluation: LootEvaluation): void;
}

/**
 * A compiled entry container. It gates on its own condition, then offers its
 * candidates to `emit`.
 *
 * @returns Whether the container contributed, which is what `alternatives`
 * and `sequence` branch on.
 */
export type LootEntryContainer = (emit: (entry: LootEntry) => void, evaluation: LootEvaluation) => boolean;

/** One compiled `pools` member. */
export interface LootPool {
    readonly condition: Predicate;
    /** Applied to every stack the pool produces, after the entry's own modifier. */
    readonly modifier: ItemModifier;
    readonly rolls: NumberProvider;
    /** Extra rolls per point of luck, floored after the multiplication as Java does. */
    readonly bonusRolls: NumberProvider;
    readonly entries: readonly LootEntryContainer[];
    /**
     * Bedrock's ladder draw, which replaces the weighted one. Absent on every
     * Java pool, because Java has no such member.
     */
    readonly tiers?: LootTiers;
}

/** A compiled loot table, ready to roll. */
export interface LootTable {
    /** The context key set the `type` field names, `generic` when it names none. */
    readonly parameterSet: ContextParameterSetName;
    /** The `random_sequence` id, which keys the table's stream for a world seed. */
    readonly randomSequence: string | undefined;
    readonly pools: readonly LootPool[];
    /** Applied to every stack the table produces, last of the three modifier levels. */
    readonly modifier: ItemModifier;
    /** Ids of the loot tables this table names by reference, for the registry's cycle report. */
    readonly references: readonly string[];
}
