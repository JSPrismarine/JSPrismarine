import type { RandomSource } from '@jsprismarine/worldgen';

import type { ConfiguredFeature } from '../features/Feature';
import { asArray, asObject } from '../json';
import type { BlockPos } from '../world/FeatureWorld';
import type { PlacementContext, PlacementModifier } from './modifiers';
import { parsePlacementModifier } from './modifiers';
import { WorldgenRandom } from './WorldgenRandom';

/**
 * The eleven decoration steps, in the order Java runs them.
 *
 * The order is part of the world's contract rather than a detail: lakes carve before local
 * modifications fill them, ores cut through both, and vegetation lands on whatever the earlier
 * steps left. A biome's `features` field is a list of eleven lists in exactly this order.
 */
export const DECORATION_STEPS = [
    'raw_generation',
    'lakes',
    'local_modifications',
    'underground_structures',
    'surface_structures',
    'strongholds',
    'underground_ores',
    'underground_decoration',
    'fluid_springs',
    'vegetal_decoration',
    'top_layer_modification'
] as const;

/** One of the eleven decoration steps. */
export type DecorationStep = (typeof DECORATION_STEPS)[number];

/** Returns a step's ordinal, which the feature seed derivation multiplies by 10000. */
export const decorationStepIndex = (step: DecorationStep): number => DECORATION_STEPS.indexOf(step);

/**
 * A feature plus the modifier chain that decides where it goes, Java's `PlacedFeature`.
 *
 * The 273 vanilla placed features are all of this shape: a reference to one of the 240 configured
 * features and between zero and six modifiers.
 */
export interface PlacedFeature {
    /** The feature placed at each position the chain produces. */
    readonly feature: ConfiguredFeature;
    /** The modifier chain, run in order. */
    readonly placement: readonly PlacementModifier[];
}

/**
 * Runs a placed feature's modifier chain and places the feature at every position it yields.
 *
 * The traversal is Java's, and it is depth first rather than stage by stage: the first position a
 * modifier emits runs all the way to the end of the chain before the second one starts. That
 * decides the order of the random draws, so a breadth-first version with the same modifiers
 * produces a different world from the same seed.
 *
 * @returns Whether any placement of the feature reported success.
 */
export const placeFeature = (
    placed: PlacedFeature,
    context: PlacementContext,
    random: RandomSource,
    origin: BlockPos
): boolean => {
    const { feature, placement } = placed;
    if (placement.length === 0) return feature.place(context.world, random, origin);

    let placedAny = false;
    const pending: { position: BlockPos; modifierIndex: number }[] = [{ position: origin, modifierIndex: 0 }];
    const produced: BlockPos[] = [];

    while (pending.length > 0) {
        const entry = pending.pop();
        if (entry === undefined) break;
        const modifier = placement[entry.modifierIndex];
        if (modifier === undefined) break;

        produced.length = 0;
        modifier.modify(context, random, entry.position, (position) => produced.push(position));

        const nextIndex = entry.modifierIndex + 1;
        if (nextIndex < placement.length) {
            // Pushed in reverse so the stack hands them back in the order the modifier emitted.
            for (let index = produced.length - 1; index >= 0; index--) {
                const position = produced[index];
                if (position !== undefined) pending.push({ position, modifierIndex: nextIndex });
            }
        } else {
            for (const position of produced) {
                placedAny = feature.place(context.world, random, position) || placedAny;
            }
        }
    }

    return placedAny;
};

/** One entry of a chunk's decoration plan: a placed feature, its step and its index in that step. */
export interface ScheduledFeature {
    /** The placed feature to run. */
    readonly feature: PlacedFeature;
    /** The decoration step it belongs to. */
    readonly step: DecorationStep;
    /**
     * The feature's index within the step's flattened, de-duplicated feature list.
     *
     * Java builds one list per step across every biome in the world, so the index is global to
     * the dimension rather than local to the chunk or the biome. Two chunks in different biomes
     * therefore seed the same feature identically.
     */
    readonly index: number;
}

/** Sorts a decoration plan into Java's execution order: step first, then index within the step. */
export const orderDecoration = (scheduled: readonly ScheduledFeature[]): ScheduledFeature[] =>
    [...scheduled].sort((a, b) => {
        const byStep = decorationStepIndex(a.step) - decorationStepIndex(b.step);
        return byStep !== 0 ? byStep : a.index - b.index;
    });

/** Reads a `worldgen/placed_feature` document, resolving its feature reference. */
export const parsePlacedFeature = (
    source: unknown,
    path: string,
    resolveFeature: (value: unknown, path: string) => ConfiguredFeature
): PlacedFeature => {
    const raw = asObject(source, path);
    return {
        feature: resolveFeature(raw['feature'], `${path}.feature`),
        placement: asArray(raw['placement'], `${path}.placement`).map((entry, index) =>
            parsePlacementModifier(entry, `${path}.placement[${index}]`)
        )
    };
};

/** What {@link decorateChunk} did, for a caller that wants to report or assert on it. */
export interface DecorationResult {
    /** The chunk's population seed, Java's "Decoration Seed" crash-report field. */
    readonly populationSeed: bigint;
    /** How many scheduled features reported placing at least one block. */
    readonly placed: number;
    /** How many were run in total. */
    readonly run: number;
}

/**
 * Runs a chunk's whole decoration pass.
 *
 * This is the entry point a chunk generator calls. It derives the population seed once, then
 * reseeds the stream before each feature from that seed, the feature's index and its step, so
 * every feature is independent of how many draws the ones before it made. Running the same plan
 * against the same seed and chunk twice produces the same blocks, and running a subset of the
 * plan does not move the rest.
 *
 * @param scheduled - The plan, which {@link orderDecoration} puts in Java's order.
 * @param levelSeed - The world seed.
 * @param chunkX - The chunk's x coordinate, not a block coordinate.
 * @param chunkZ - The chunk's z coordinate.
 */
export const decorateChunk = (
    scheduled: readonly ScheduledFeature[],
    context: PlacementContext,
    levelSeed: bigint,
    chunkX: number,
    chunkZ: number
): DecorationResult => {
    const random = new WorldgenRandom();
    const origin: BlockPos = { x: chunkX * 16, y: context.world.minY, z: chunkZ * 16 };
    const populationSeed = random.setDecorationSeed(levelSeed, origin.x, origin.z);

    let placed = 0;
    const ordered = orderDecoration(scheduled);
    for (const entry of ordered) {
        random.setFeatureSeed(populationSeed, entry.index, decorationStepIndex(entry.step));
        if (placeFeature(entry.feature, context, random, origin)) placed++;
    }

    return { populationSeed, placed, run: ordered.length };
};
