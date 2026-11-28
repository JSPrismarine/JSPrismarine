/**
 * How a behavior pack's `dimensions/<name>.json` becomes a custom dimension of a level.
 *
 * Bedrock 1.26.50 added the document: `minecraft:dimension` with a `description.identifier` and
 * the components `minecraft:dimension_height`, `minecraft:default_biome`, `minecraft:generation`
 * and, from 1.26.60, `minecraft:clouds`. The only generator is `void`, and a pack cannot redefine
 * a vanilla dimension. The defaults below are the ones the `client_server/dimension/1.26.50`
 * schemas in `bedrock-samples` give; the `pack-dimensions` parity scenario checks them on BDS.
 */
import type { DimensionTypeDefinition } from '@jsprismarine/worldgen';

import { isRecord } from '../utils/isRecord';
import { CLOUD_HEIGHT_ATTRIBUTE, Dimensions } from './DimensionType';

/** The schema's default `min_y` and `height_range`, the Overworld's bounds. */
const DEFAULT_MIN_Y = -64;
const DEFAULT_HEIGHT = 384;
/** The schema's limits on the bounds, which the client's `DimensionData` fields share. */
const MIN_Y_LIMIT = 512;
const HEIGHT_MIN = 16;
const HEIGHT_MAX = 1024;
/** The schema's cloud height when the document leaves `minecraft:clouds` out. */
const DEFAULT_CLOUD_HEIGHT = 128;

/** A pack dimension read from its document, or why it cannot be one. */
export type PackDimension =
    { readonly typeId: string; readonly definition: DimensionTypeDefinition } | { readonly problem: string };

/** A component's object, or an empty one when the document leaves the component out. */
const component = (components: Record<string, unknown>, key: string): Record<string, unknown> | undefined => {
    const value = components[key];
    if (value === undefined) return {};
    return isRecord(value) ? value : undefined;
};

/** An integer field, its default when absent, or undefined when it is not an integer. */
const integerField = (from: Record<string, unknown>, key: string, fallback: number): number | undefined => {
    const value = from[key] ?? fallback;
    return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
};

/**
 * Reads one `minecraft:dimension` document into the dimension type its void stem binds: the
 * Overworld's physics with the document's bounds and cloud height.
 *
 * `minecraft:default_biome` is not read: the void generator fills no chunk, and the join's
 * `BiomeDefinitionList` lists only vanilla biomes, so the client is told `minecraft:plains`, as
 * for a script's dimension.
 */
export const packDimensionOf = (identifier: string, data: unknown): PackDimension => {
    const dimension = isRecord(data) ? data['minecraft:dimension'] : undefined;
    const components = isRecord(dimension) && isRecord(dimension.components) ? dimension.components : {};
    if (identifier.startsWith('minecraft:') || !identifier.includes(':'))
        return { problem: `${identifier} is not a custom dimension id; a pack cannot redefine a vanilla dimension` };

    // BDS adds no dimension for a document without a generator, as the `pack-dimensions` parity
    // scenario recorded, though the schema marks no component as required.
    const generation = components['minecraft:generation'];
    const generator = isRecord(generation) ? generation.generator_type : undefined;
    if (generator !== 'void')
        return {
            problem:
                generator === undefined
                    ? 'it has no minecraft:generation with a generator_type, which BDS requires'
                    : `its generator_type is ${JSON.stringify(generator)}, and void is the only one`
        };

    const bounds = component(components, 'minecraft:dimension_height');
    const minY = bounds && integerField(bounds, 'min_y', DEFAULT_MIN_Y);
    const height = bounds && integerField(bounds, 'height_range', DEFAULT_HEIGHT);
    if (minY === undefined || minY < -MIN_Y_LIMIT || minY > MIN_Y_LIMIT || minY % 16 !== 0)
        return { problem: `its min_y has to be a multiple of 16 from -${MIN_Y_LIMIT} to ${MIN_Y_LIMIT}` };
    if (height === undefined || height < HEIGHT_MIN || height > HEIGHT_MAX || height % 16 !== 0)
        return { problem: `its height_range has to be a multiple of 16 from ${HEIGHT_MIN} to ${HEIGHT_MAX}` };

    const clouds = component(components, 'minecraft:clouds');
    const cloudHeight = clouds && integerField(clouds, 'height', DEFAULT_CLOUD_HEIGHT);
    if (cloudHeight === undefined || cloudHeight < -MIN_Y_LIMIT || cloudHeight > MIN_Y_LIMIT)
        return { problem: `its cloud height has to be a whole number from -${MIN_Y_LIMIT} to ${MIN_Y_LIMIT}` };
    const attributes = new Map(Dimensions.Overworld.java.attributes);
    attributes.set(CLOUD_HEIGHT_ATTRIBUTE, cloudHeight);

    return {
        typeId: identifier,
        definition: { ...Dimensions.Overworld.java, minY, height, logicalHeight: height, attributes }
    };
};
