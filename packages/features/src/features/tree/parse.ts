/** Parses a `minecraft:tree` configuration and its placers, size and decorators. */

import { asArray, asInteger, asNumber, asObject, fail } from '../../json';
import { parseDirection } from '../../providers/blockPredicate';
import { parseIntProvider } from '../../providers/valueProviders';
import { parseBlockSet, typeNameOf } from '../../registry';
import type { Direction } from '../../world/BlockState';
import type { FeatureParsers } from '../parseContext';

import {
    alterGroundDecorator,
    attachedToLeavesDecorator,
    attachedToLogsDecorator,
    beehiveDecorator,
    cocoaDecorator,
    creakingHeartDecorator,
    leaveVineDecorator,
    paleMossDecorator,
    placeOnGroundDecorator,
    shelfMushroomDecorator,
    trunkVineDecorator
} from './decorators';
import {
    acaciaFoliagePlacer,
    blobFoliagePlacer,
    bushFoliagePlacer,
    cherryFoliagePlacer,
    darkOakFoliagePlacer,
    fancyFoliagePlacer,
    megaJungleFoliagePlacer,
    megaPineFoliagePlacer,
    pineFoliagePlacer,
    poplarFoliagePlacer,
    randomSpreadFoliagePlacer,
    spruceFoliagePlacer
} from './foliagePlacers';
import { mangroveRootPlacer } from './rootPlacers';
import type { FeatureSize, FoliagePlacer, RootPlacer, TreeConfig, TreeDecorator, TrunkPlacer } from './shared';
import {
    bendingTrunkPlacer,
    cherryTrunkPlacer,
    darkOakTrunkPlacer,
    fancyTrunkPlacer,
    forkingTrunkPlacer,
    giantTrunkPlacer,
    megaJungleTrunkPlacer,
    poplarTrunkPlacer,
    straightTrunkPlacer,
    upwardsBranchingTrunkPlacer
} from './trunkPlacers';

// --- Parsing -------------------------------------------------------------------------------

const parseFeatureSize = (source: unknown, path: string): FeatureSize => {
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    const minClipped = raw['min_clipped_height'];
    const minClippedHeight = minClipped === undefined ? undefined : asInteger(minClipped, `${path}.min_clipped_height`);
    if (type === 'two_layers_feature_size') {
        const limit = asInteger(raw['limit'], `${path}.limit`, 1);
        const lowerSize = asInteger(raw['lower_size'], `${path}.lower_size`, 0);
        const upperSize = asInteger(raw['upper_size'], `${path}.upper_size`, 1);
        return {
            type: 'two_layers_feature_size',
            ...(minClippedHeight === undefined ? {} : { minClippedHeight }),
            sizeAtHeight: (_treeHeight, y) => (y < limit ? lowerSize : upperSize)
        };
    }
    if (type === 'three_layers_feature_size') {
        const limit = asInteger(raw['limit'], `${path}.limit`, 1);
        const upperLimit = asInteger(raw['upper_limit'], `${path}.upper_limit`, 1);
        const lowerSize = asInteger(raw['lower_size'], `${path}.lower_size`, 0);
        const middleSize = asInteger(raw['middle_size'], `${path}.middle_size`, 1);
        const upperSize = asInteger(raw['upper_size'], `${path}.upper_size`, 1);
        return {
            type: 'three_layers_feature_size',
            ...(minClippedHeight === undefined ? {} : { minClippedHeight }),
            sizeAtHeight: (treeHeight, y) =>
                y < limit ? lowerSize : y >= treeHeight - upperLimit ? upperSize : middleSize
        };
    }
    return fail(path, `unknown feature size type ${JSON.stringify(type)}`);
};

/** Parses a `trunk_placer` body into the matching placer. */
export const parseTrunkPlacer = (source: unknown, path: string): TrunkPlacer => {
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    const base = asInteger(raw['base_height'], `${path}.base_height`);
    const randA = asInteger(raw['height_rand_a'], `${path}.height_rand_a`);
    const randB = asInteger(raw['height_rand_b'], `${path}.height_rand_b`);
    switch (type) {
        case 'straight_trunk_placer':
            return straightTrunkPlacer(base, randA, randB);
        case 'forking_trunk_placer':
            return forkingTrunkPlacer(base, randA, randB);
        case 'giant_trunk_placer':
            return giantTrunkPlacer(base, randA, randB);
        case 'mega_jungle_trunk_placer':
            return megaJungleTrunkPlacer(base, randA, randB);
        case 'dark_oak_trunk_placer':
            return darkOakTrunkPlacer(base, randA, randB);
        case 'fancy_trunk_placer':
            return fancyTrunkPlacer(base, randA, randB);
        case 'bending_trunk_placer':
            return bendingTrunkPlacer(
                base,
                randA,
                randB,
                asInteger(raw['min_height_for_leaves'], `${path}.min_height_for_leaves`, 1),
                parseIntProvider(raw['bend_length'], `${path}.bend_length`)
            );
        case 'poplar_trunk_placer':
            return poplarTrunkPlacer(
                base,
                randA,
                randB,
                parseIntProvider(raw['trunk_height_above_branches'], `${path}.trunk_height_above_branches`),
                parseIntProvider(raw['branch_amount'], `${path}.branch_amount`)
            );
        case 'upwards_branching_trunk_placer':
            return upwardsBranchingTrunkPlacer(
                base,
                randA,
                randB,
                parseIntProvider(raw['extra_branch_steps'], `${path}.extra_branch_steps`),
                asNumber(raw['place_branch_per_log_probability'], `${path}.place_branch_per_log_probability`),
                parseIntProvider(raw['extra_branch_length'], `${path}.extra_branch_length`),
                parseBlockSet(raw['can_grow_through'], `${path}.can_grow_through`)
            );
        case 'cherry_trunk_placer': {
            const start = asObject(raw['branch_start_offset_from_top'], `${path}.branch_start_offset_from_top`);
            return cherryTrunkPlacer(
                base,
                randA,
                randB,
                parseIntProvider(raw['branch_count'], `${path}.branch_count`),
                parseIntProvider(raw['branch_horizontal_length'], `${path}.branch_horizontal_length`),
                asInteger(start['min_inclusive'], `${path}.branch_start_offset_from_top.min_inclusive`),
                asInteger(start['max_inclusive'], `${path}.branch_start_offset_from_top.max_inclusive`),
                parseIntProvider(raw['branch_end_offset_from_top'], `${path}.branch_end_offset_from_top`)
            );
        }
        default:
            return fail(path, `unknown trunk placer type ${JSON.stringify(type)}`);
    }
};

const parseFoliagePlacer = (source: unknown, path: string): FoliagePlacer => {
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    const radius = parseIntProvider(raw['radius'], `${path}.radius`);
    const placerOffset = parseIntProvider(raw['offset'], `${path}.offset`);
    switch (type) {
        case 'blob_foliage_placer':
            return blobFoliagePlacer(radius, placerOffset, asInteger(raw['height'], `${path}.height`));
        case 'bush_foliage_placer':
            return bushFoliagePlacer(radius, placerOffset, asInteger(raw['height'], `${path}.height`));
        case 'fancy_foliage_placer':
            return fancyFoliagePlacer(radius, placerOffset, asInteger(raw['height'], `${path}.height`));
        case 'spruce_foliage_placer':
            return spruceFoliagePlacer(
                radius,
                placerOffset,
                parseIntProvider(raw['trunk_height'], `${path}.trunk_height`)
            );
        case 'pine_foliage_placer':
            return pineFoliagePlacer(radius, placerOffset, parseIntProvider(raw['height'], `${path}.height`));
        case 'acacia_foliage_placer':
            return acaciaFoliagePlacer(radius, placerOffset);
        case 'dark_oak_foliage_placer':
            return darkOakFoliagePlacer(radius, placerOffset);
        case 'jungle_foliage_placer':
            return megaJungleFoliagePlacer(radius, placerOffset, asInteger(raw['height'], `${path}.height`));
        case 'mega_pine_foliage_placer':
            return megaPineFoliagePlacer(
                radius,
                placerOffset,
                parseIntProvider(raw['crown_height'], `${path}.crown_height`)
            );
        case 'random_spread_foliage_placer':
            return randomSpreadFoliagePlacer(
                radius,
                placerOffset,
                parseIntProvider(raw['foliage_height'], `${path}.foliage_height`),
                asInteger(raw['leaf_placement_attempts'], `${path}.leaf_placement_attempts`)
            );
        case 'cherry_foliage_placer':
            return cherryFoliagePlacer(
                radius,
                placerOffset,
                parseIntProvider(raw['height'], `${path}.height`),
                asNumber(raw['wide_bottom_layer_hole_chance'], `${path}.wide_bottom_layer_hole_chance`),
                asNumber(raw['corner_hole_chance'], `${path}.corner_hole_chance`),
                asNumber(raw['hanging_leaves_chance'], `${path}.hanging_leaves_chance`),
                asNumber(raw['hanging_leaves_extension_chance'], `${path}.hanging_leaves_extension_chance`)
            );
        case 'poplar_foliage_placer':
            return poplarFoliagePlacer(
                radius,
                placerOffset,
                parseIntProvider(raw['height'], `${path}.height`),
                asNumber(raw['side_hole_chance'], `${path}.side_hole_chance`)
            );
        default:
            return fail(path, `unknown foliage placer type ${JSON.stringify(type)}`);
    }
};

const parseRootPlacer = (source: unknown, path: string, parsers: FeatureParsers): RootPlacer => {
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    if (type !== 'mangrove_root_placer') return fail(path, `unknown root placer type ${JSON.stringify(type)}`);
    const aboveRoot = raw['above_root_placement'];
    const above = aboveRoot === undefined ? undefined : asObject(aboveRoot, `${path}.above_root_placement`);
    const mangrove = asObject(raw['mangrove_root_placement'], `${path}.mangrove_root_placement`);
    return mangroveRootPlacer(
        parseIntProvider(raw['trunk_offset_y'], `${path}.trunk_offset_y`),
        parsers.blockStateProvider(raw['root_provider'], `${path}.root_provider`),
        above === undefined
            ? undefined
            : parsers.blockStateProvider(
                  above['above_root_provider'],
                  `${path}.above_root_placement.above_root_provider`
              ),
        above === undefined
            ? 0
            : asNumber(
                  above['above_root_placement_chance'],
                  `${path}.above_root_placement.above_root_placement_chance`
              ),
        parseBlockSet(mangrove['can_grow_through'], `${path}.mangrove_root_placement.can_grow_through`),
        parseBlockSet(mangrove['muddy_roots_in'], `${path}.mangrove_root_placement.muddy_roots_in`),
        parsers.blockStateProvider(
            mangrove['muddy_roots_provider'],
            `${path}.mangrove_root_placement.muddy_roots_provider`
        ),
        asInteger(mangrove['max_root_width'], `${path}.mangrove_root_placement.max_root_width`),
        asInteger(mangrove['max_root_length'], `${path}.mangrove_root_placement.max_root_length`),
        asNumber(mangrove['random_skew_chance'], `${path}.mangrove_root_placement.random_skew_chance`)
    );
};

const parseDirections = (source: unknown, path: string): Direction[] =>
    asArray(source, path).map((entry, index) => parseDirection(entry, `${path}[${index}]`));

/** Parses one `decorators` entry into the matching decorator. */
export const parseTreeDecorator = (source: unknown, path: string, parsers: FeatureParsers): TreeDecorator => {
    const raw = asObject(source, path);
    const type = typeNameOf(raw['type'], path);
    switch (type) {
        case 'trunk_vine':
            return trunkVineDecorator();
        case 'leave_vine':
            return leaveVineDecorator(asNumber(raw['probability'], `${path}.probability`));
        case 'cocoa':
            return cocoaDecorator(asNumber(raw['probability'], `${path}.probability`));
        case 'beehive':
            return beehiveDecorator(asNumber(raw['probability'], `${path}.probability`));
        case 'creaking_heart':
            return creakingHeartDecorator(asNumber(raw['probability'], `${path}.probability`));
        case 'shelf_mushroom':
            return shelfMushroomDecorator(asNumber(raw['probability'], `${path}.probability`));
        case 'alter_ground':
            return alterGroundDecorator(parsers.blockStateProvider(raw['provider'], `${path}.provider`));
        case 'attached_to_leaves':
            return attachedToLeavesDecorator(
                asNumber(raw['probability'], `${path}.probability`),
                asInteger(raw['exclusion_radius_xz'], `${path}.exclusion_radius_xz`),
                asInteger(raw['exclusion_radius_y'], `${path}.exclusion_radius_y`),
                parsers.blockStateProvider(raw['block_provider'], `${path}.block_provider`),
                asInteger(raw['required_empty_blocks'], `${path}.required_empty_blocks`),
                parseDirections(raw['directions'], `${path}.directions`)
            );
        case 'attached_to_logs':
            return attachedToLogsDecorator(
                asNumber(raw['probability'], `${path}.probability`),
                parsers.blockStateProvider(raw['block_provider'], `${path}.block_provider`),
                parseDirections(raw['directions'], `${path}.directions`)
            );
        case 'pale_moss':
            return paleMossDecorator(
                asNumber(raw['leaves_probability'], `${path}.leaves_probability`),
                asNumber(raw['trunk_probability'], `${path}.trunk_probability`),
                asNumber(raw['ground_probability'], `${path}.ground_probability`)
            );
        case 'place_on_ground':
            return placeOnGroundDecorator(
                asInteger(raw['tries'], `${path}.tries`, 128),
                asInteger(raw['radius'], `${path}.radius`, 2),
                asInteger(raw['height'], `${path}.height`, 1),
                parsers.blockStateProvider(raw['block_state_provider'], `${path}.block_state_provider`)
            );
        default:
            return fail(path, `unknown tree decorator type ${JSON.stringify(type)}`);
    }
};

/** Reads a `minecraft:tree` configuration. */
export const parseTreeConfig = (raw: Record<string, unknown>, path: string, parsers: FeatureParsers): TreeConfig => {
    const rootPlacer = raw['root_placer'];
    return {
        trunkProvider: parsers.blockStateProvider(raw['trunk_provider'], `${path}.trunk_provider`),
        trunkPlacer: parseTrunkPlacer(raw['trunk_placer'], `${path}.trunk_placer`),
        foliageProvider: parsers.blockStateProvider(raw['foliage_provider'], `${path}.foliage_provider`),
        foliagePlacer: parseFoliagePlacer(raw['foliage_placer'], `${path}.foliage_placer`),
        ...(rootPlacer === undefined
            ? {}
            : { rootPlacer: parseRootPlacer(rootPlacer, `${path}.root_placer`, parsers) }),
        minimumSize: parseFeatureSize(raw['minimum_size'], `${path}.minimum_size`),
        decorators: asArray(raw['decorators'], `${path}.decorators`).map((entry, index) =>
            parseTreeDecorator(entry, `${path}.decorators[${index}]`, parsers)
        ),
        ignoreVines: raw['ignore_vines'] === true,
        belowTrunkProvider:
            raw['below_trunk_provider'] === undefined
                ? parsers.blockStateProvider({ id: 'minecraft:dirt' }, `${path}.below_trunk_provider`)
                : parsers.blockStateProvider(raw['below_trunk_provider'], `${path}.below_trunk_provider`)
    };
};
