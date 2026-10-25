import type { PlacedFeature } from '../placement/pipeline';
import type { BlockStateProvider } from '../providers/blockStateProvider';
import type { BlockState, Direction, VerticalDirection } from '../world/BlockState';

/**
 * The nested parsers a feature needs that it cannot import directly.
 *
 * Features reference placed features, placed features reference features, and both reference the
 * registry. Passing the parsers in rather than importing them keeps the cycle out of the module
 * graph and lets a caller resolve `minecraft:oak` by identifier instead of inlining it.
 */
export interface FeatureParsers {
    /** Reads a nested placed feature, which may be an identifier or an inline document. */
    placedFeature(source: unknown, path: string): PlacedFeature;
    /** Reads a list of nested placed features, or a single tag-free identifier. */
    placedFeatureList(source: unknown, path: string): PlacedFeature[];
    /** Reads a block state provider, resolving a `block_state_provider` reference. */
    blockStateProvider(source: unknown, path: string): BlockStateProvider;
    /** Reads a registry identifier, normalizing the namespace. */
    identifier(source: unknown, path: string): string;
    /** Reads any of the six directions. */
    direction(source: unknown, path: string): Direction;
    /** Reads `up` or `down`. */
    verticalDirection(source: unknown, path: string): VerticalDirection;
    /**
     * Reads a fluid state as the block state Java's `createLegacyBlock` would produce.
     *
     * A fluid state is not a block state in Java, but every use in the feature data names a
     * source fluid, and a source fluid's legacy block is the fluid block at level zero.
     */
    fluidState(source: unknown, path: string): BlockState;
}
