import type { RandomSource } from '@jsprismarine/worldgen';

import type { BlockPos, FeatureWorld } from '../world/FeatureWorld';

/** The 58 feature types Java 26.3 registers in `worldgen/feature_type`. */
export const FEATURE_TYPES = [
    'bamboo',
    'block_blob',
    'block_column',
    'block_pile',
    'blue_ice',
    'bonus_chest',
    'chorus_plant',
    'coral_claw',
    'coral_tree',
    'delta_feature',
    'disk',
    'end_gateway',
    'end_island',
    'end_platform',
    'end_podium',
    'end_spike',
    'fallen_tree',
    'fill_layer',
    'fossil',
    'freeze_top_layer',
    'geode',
    'huge_brown_mushroom',
    'huge_fungus',
    'huge_red_mushroom',
    'iceberg',
    'lake',
    'large_dripstone',
    'monster_room',
    'multiface_growth',
    'netherrack_replace_blobs',
    'no_op',
    'ore',
    'overlay',
    'projected_random_patchy_square',
    'random_boolean_selector',
    'random_neighbor_spread',
    'random_selector',
    'replace_single_block',
    'root_system',
    'scattered_ore',
    'sculk_patch',
    'sequence',
    'simple_block',
    'simple_random_selector',
    'single_block_pillar',
    'speleothem',
    'speleothem_cluster',
    'spike',
    'spring_feature',
    'stepped_column_cluster',
    'template',
    'tree',
    'underwater_magma',
    'vegetation_patch',
    'vines',
    'void_start_platform',
    'waterlogged_vegetation_patch',
    'weighted_random_selector'
] as const;

/** One of the 58 registered feature types. */
export type FeatureTypeName = (typeof FEATURE_TYPES)[number];

/**
 * A feature type bound to its configuration, Java's `ConfiguredFeature`.
 *
 * The 240 vanilla configured features are instances of 47 of the 58 types. Placing one is a pure
 * function of the world, the random stream and an origin, which is what lets the placement
 * pipeline call the same feature at many positions without any per-call setup.
 */
export interface ConfiguredFeature {
    /** The feature type's registry name. */
    readonly type: FeatureTypeName;
    /**
     * Builds the feature at an origin.
     *
     * @returns Whether anything was placed. Java uses this to decide whether a placed feature
     *   counts as having run, and several wrapper features propagate it.
     */
    place(world: FeatureWorld, random: RandomSource, origin: BlockPos): boolean;
    /** The features this one may delegate to, so a corpus walk can reach every nested type. */
    readonly children?: readonly ConfiguredFeature[];
}

/** Builds a {@link ConfiguredFeature} from a placement function. */
export const feature = (
    type: FeatureTypeName,
    place: ConfiguredFeature['place'],
    children?: readonly ConfiguredFeature[]
): ConfiguredFeature => (children === undefined ? { type, place } : { type, place, children });

/** The feature that does nothing, which selectors use as a weighted "place nothing" branch. */
export const noOpFeature: ConfiguredFeature = feature('no_op', () => false);

/** Walks a feature and everything it delegates to, depth first, including the root. */
export const walkFeatures = function* (root: ConfiguredFeature): Generator<ConfiguredFeature> {
    yield root;
    for (const child of root.children ?? []) yield* walkFeatures(child);
};
