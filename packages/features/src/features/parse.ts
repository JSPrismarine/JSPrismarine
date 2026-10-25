import { asArray, asObject, fail } from '../json';
import type { PlacedFeature } from '../placement/pipeline';
import { parsePlacedFeature } from '../placement/pipeline';
import type { BlockStateProvider } from '../providers/blockStateProvider';
import { parseBlockState, parseBlockStateProvider } from '../providers/blockStateProvider';
import { normalizeIdentifier, typeNameOf } from '../registry';
import type { BlockState, Direction, VerticalDirection } from '../world/BlockState';
import { ALL_DIRECTIONS, blockState } from '../world/BlockState';
import { parseCaveFeature } from './caves';
import type { ConfiguredFeature, FeatureTypeName } from './Feature';
import { FEATURE_TYPES } from './Feature';
import { parseOreFeature } from './ore';
import type { FeatureParsers } from './parseContext';
import { parseSimpleFeature } from './simple';
import { parseStructuralFeature } from './structural';
import { parseTreeFeature } from './tree';

/**
 * Resolves `worldgen/feature` and `worldgen/placed_feature` identifiers.
 *
 * Both registries reference each other, so a loader hands this one object in and gets a lazily
 * resolving reader back. Vanilla's 240 features and 273 placed features form a graph eleven
 * levels deep in places, which is why resolution is by identifier rather than by inlining.
 */
export interface FeatureRegistry {
    /** Returns the parsed JSON of a `worldgen/feature` document, or `undefined` when absent. */
    feature(id: string): unknown;
    /** Returns the parsed JSON of a `worldgen/placed_feature` document, or `undefined`. */
    placedFeature(id: string): unknown;
    /**
     * Returns the parsed JSON of a `worldgen/block_state_provider` document, or `undefined`.
     *
     * 26.3 made block state providers a referenceable registry, and vanilla ships eight of them;
     * `soil_beneath_tree` alone is named by 40 of the 45 configured trees.
     */
    blockStateProvider?(id: string): unknown;
}

/** Reads the two feature registries, resolving references and caching what it builds. */
export class FeatureLoader {
    private readonly features = new Map<string, ConfiguredFeature>();
    private readonly providers = new Map<string, BlockStateProvider>();
    private readonly placed = new Map<string, PlacedFeature>();
    private readonly inProgress = new Set<string>();
    private readonly parsers: FeatureParsers;

    public constructor(private readonly registry: FeatureRegistry) {
        this.parsers = {
            placedFeature: (source, path) => this.readPlacedFeature(source, path),
            placedFeatureList: (source, path) => this.readPlacedFeatureList(source, path),
            blockStateProvider: (source, path) =>
                parseBlockStateProvider(source, path, (id, referencePath) => this.provider(id, referencePath)),
            identifier: (source, path) => normalizeIdentifier(source, path),
            direction: (source, path) => readDirection(source, path),
            verticalDirection: (source, path) => readVerticalDirection(source, path),
            fluidState: (source, path) => readFluidState(source, path)
        };
    }

    /** Reads a configured feature by identifier. */
    public feature(id: string): ConfiguredFeature {
        const full = normalizeIdentifier(id, 'feature');
        const cached = this.features.get(full);
        if (cached !== undefined) return cached;
        if (this.inProgress.has(full)) return fail(full, 'feature reference cycle');

        const source = this.registry.feature(full);
        if (source === undefined) return fail(full, 'no such configured feature');
        this.inProgress.add(full);
        try {
            const parsed = this.readFeature(source, full);
            this.features.set(full, parsed);
            return parsed;
        } finally {
            this.inProgress.delete(full);
        }
    }

    /** Reads a `worldgen/block_state_provider` entry by identifier. */
    public provider(id: string, path = 'block_state_provider'): BlockStateProvider {
        const full = normalizeIdentifier(id, path);
        const cached = this.providers.get(full);
        if (cached !== undefined) return cached;

        const source = this.registry.blockStateProvider?.(full);
        if (source === undefined) return fail(path, `no such block state provider ${JSON.stringify(full)}`);
        const parsed = parseBlockStateProvider(source, full, (nested, nestedPath) => this.provider(nested, nestedPath));
        this.providers.set(full, parsed);
        return parsed;
    }

    /** Reads a placed feature by identifier. */
    public placedFeatureById(id: string): PlacedFeature {
        const full = normalizeIdentifier(id, 'placed_feature');
        const cached = this.placed.get(full);
        if (cached !== undefined) return cached;

        const source = this.registry.placedFeature(full);
        if (source === undefined) return fail(full, 'no such placed feature');
        const parsed = parsePlacedFeature(source, full, (value, path) => this.readFeature(value, path));
        this.placed.set(full, parsed);
        return parsed;
    }

    /** Reads an inline or referenced configured feature document. */
    public readFeature(source: unknown, path: string): ConfiguredFeature {
        if (typeof source === 'string') return this.feature(source);
        const raw = asObject(source, path);
        const type = typeNameOf(raw['type'], path);
        if (!(FEATURE_TYPES as readonly string[]).includes(type)) {
            return fail(path, `unknown feature type ${JSON.stringify(type)}`);
        }

        const parsed =
            parseSimpleFeature(type, raw, path, this.parsers) ??
            parseOreFeature(type, raw, path) ??
            parseTreeFeature(type, raw, path, this.parsers) ??
            parseCaveFeature(type, raw, path, this.parsers) ??
            parseStructuralFeature(type, raw, path, this.parsers);
        if (parsed === undefined) {
            // Every name in FEATURE_TYPES is handled by one of the five readers, so reaching
            // here means a type was registered without a reader rather than that the data is
            // wrong. Failing loudly keeps that from becoming a silently missing feature.
            return fail(path, `feature type ${JSON.stringify(type)} is registered but has no reader`);
        }
        return parsed;
    }

    private readPlacedFeature(source: unknown, path: string): PlacedFeature {
        if (typeof source === 'string') return this.placedFeatureById(source);
        return parsePlacedFeature(source, path, (value, featurePath) => this.readFeature(value, featurePath));
    }

    private readPlacedFeatureList(source: unknown, path: string): PlacedFeature[] {
        // A `HolderSet` accepts one element, a list, or a tag reference. Vanilla uses the first
        // two; a tag of placed features does not appear in the feature data.
        if (typeof source === 'string') return [this.readPlacedFeature(source, path)];
        if (!Array.isArray(source)) return [this.readPlacedFeature(source, path)];
        return asArray(source, path).map((entry, index) => this.readPlacedFeature(entry, `${path}[${index}]`));
    }
}

const readDirection = (source: unknown, path: string): Direction => {
    if (typeof source === 'string' && (ALL_DIRECTIONS as readonly string[]).includes(source)) {
        // The membership test narrows the string to the Direction union.
        return source as Direction;
    }
    return fail(path, `expected a direction, got ${JSON.stringify(source)}`);
};

const readVerticalDirection = (source: unknown, path: string): VerticalDirection => {
    if (source === 'up' || source === 'down') return source;
    return fail(path, `expected up or down, got ${JSON.stringify(source)}`);
};

/**
 * Reads a fluid state as the block state Java's `createLegacyBlock` would produce.
 *
 * Every spring in the vanilla data names a source fluid, and a source fluid's legacy block is
 * the fluid block at level zero, so the `falling` property the data carries does not reach the
 * world.
 */
const readFluidState = (source: unknown, path: string): BlockState => {
    const state = parseBlockState(source, path);
    return blockState(state.name, { level: '0' });
};

/** A feature type and how many of the parsed documents used it. */
export type FeatureTypeUsage = ReadonlyMap<FeatureTypeName, number>;
