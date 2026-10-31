/**
 * A dimension type with its Bedrock view resolved.
 *
 * Java describes a dimension's physics in a `dimension_type` document, which
 * `@jsprismarine/worldgen` parses into a `DimensionTypeDefinition`. The Bedrock client needs
 * four things that document does not say: the integer id its packets and the LevelDB chunk
 * keys carry, its own spelling of the name, and the vertical range it accepts for that id.
 * `@jsprismarine/mapping` keeps those as a three-row overlay. {@link dimensionTypeOf} joins the
 * two into the one object the rest of the server reads.
 *
 * The id is the Java one. Everything that talks to the client or the save reads
 * {@link DimensionType.bedrockId}; everything that names a dimension to the content runtime
 * reads {@link DimensionType.bedrockName}, which `name` aliases.
 */
import { bedrockDimensionOverlay, javaDimensionTypeOf } from '@jsprismarine/mapping';
import type { DimensionTypeDefinition } from '@jsprismarine/worldgen';

import { VANILLA_DIMENSION_TYPES } from './vanillaDimensionTypes';

/**
 * How tall a dimension is, where its floor sits, and what the client and the save call it.
 *
 * Every vertical bound in the chunk stack derives from one of these rather than from a constant,
 * because the three vanilla dimensions do not agree on any of them: the Overworld starts at -64
 * and is 384 blocks tall, the Nether starts at 0 and is 128 as far as the client is concerned,
 * the End starts at 0 and is 256.
 *
 * The sub chunk index is the y coordinate shifted right by four, and stays signed: index -4 is
 * the Overworld's bottom sub chunk, covering y -64 to -49. That is also exactly how the index
 * byte is stored in a Bedrock world's sub chunk records, so nothing needs rebasing on the way to
 * disk.
 */
export interface DimensionType {
    /** The Java `dimension_type` id, `minecraft:the_nether` for the Nether. */
    readonly id: string;
    /** The integer the client, `ChangeDimension` and a LevelDB chunk key use: 0, 1, 2, or 1000 and up. */
    readonly bedrockId: number;
    /** The client's spelling, `minecraft:nether` for Java's `minecraft:the_nether`. */
    readonly bedrockName: string;
    /** The same as {@link bedrockName}; the spelling the content runtime keys its worlds by. */
    readonly name: string;
    /** The lowest block y the client accepts for {@link bedrockId}. */
    readonly minY: number;
    /** How many blocks the client accepts above `minY`; 128 for the Nether where Java says 256. */
    readonly height: number;
    /** The Java definition, for the fields the overlay leaves alone: sky light, scale, the clock. */
    readonly java: DimensionTypeDefinition;
    /** Whether the client has no built-in dimension for this type and has to be told about it. */
    readonly custom: boolean;
}

/**
 * The first id a dimension type without a Bedrock overlay gets. A `Level` hands them out from
 * here in stem order.
 */
export const FIRST_CUSTOM_DIMENSION_ID = 1000;

/** The floor and ceiling the Bedrock client accepts for a dimension it was told about. */
const BEDROCK_MIN_Y = -512;
const BEDROCK_MAX_Y = 512;

/**
 * Joins a parsed Java `dimension_type` with its Bedrock overlay.
 *
 * A type the overlay lists keeps the overlay's id and name, and the overlay's bounds where it
 * has them. A type it does not list is custom: it takes `customId`, keeps its Java name, and has
 * its Java bounds clamped to the -512 to 512 range the client accepts.
 *
 * @param definition - The parsed Java type.
 * @param javaId - The Java `dimension_type` id the definition was loaded under.
 * @param customId - The Bedrock id to give a type without an overlay, {@link FIRST_CUSTOM_DIMENSION_ID} or
 *   higher. Ignored for a type the overlay lists.
 * @throws {RangeError} When the type has no overlay and `customId` is absent or below
 *   {@link FIRST_CUSTOM_DIMENSION_ID}.
 */
export const dimensionTypeOf = (
    definition: DimensionTypeDefinition,
    javaId: string,
    customId?: number
): DimensionType => {
    const overlay = bedrockDimensionOverlay(javaId);
    if (overlay !== undefined) {
        const bedrockName = overlay.bedrockName;
        return {
            id: javaId,
            bedrockId: overlay.dimensionId,
            bedrockName,
            name: bedrockName,
            minY: overlay.minY ?? definition.minY,
            height: overlay.height ?? definition.height,
            java: definition,
            custom: false
        };
    }

    if (customId === undefined || customId < FIRST_CUSTOM_DIMENSION_ID) {
        throw new RangeError(
            `${javaId} has no Bedrock dimension overlay and needs a custom id of ${FIRST_CUSTOM_DIMENSION_ID} or more, got ${customId}`
        );
    }
    const minY = Math.max(definition.minY, BEDROCK_MIN_Y);
    const top = Math.min(definition.minY + definition.height, BEDROCK_MAX_Y);
    return {
        id: javaId,
        bedrockId: customId,
        bedrockName: javaId,
        name: javaId,
        minY,
        height: top - minY,
        java: definition,
        custom: true
    };
};

/**
 * The three vanilla dimensions, built from the 26.3 `dimension_type` documents and the overlay.
 */
export const Dimensions: Readonly<Record<'Overworld' | 'Nether' | 'TheEnd', DimensionType>> = {
    Overworld: dimensionTypeOf(VANILLA_DIMENSION_TYPES['minecraft:overworld'], 'minecraft:overworld'),
    Nether: dimensionTypeOf(VANILLA_DIMENSION_TYPES['minecraft:the_nether'], 'minecraft:the_nether'),
    TheEnd: dimensionTypeOf(VANILLA_DIMENSION_TYPES['minecraft:the_end'], 'minecraft:the_end')
};

const vanillaByJavaId: ReadonlyMap<string, DimensionType> = new Map(
    [Dimensions.Overworld, Dimensions.Nether, Dimensions.TheEnd].map((dimension) => [dimension.id, dimension])
);

/**
 * The vanilla dimension a name identifies, by either spelling.
 *
 * `minecraft:nether` and `minecraft:the_nether` both answer the Nether. A bare `nether` is read
 * as `minecraft:nether`, which is what the old `dimensionByName` accepted.
 *
 * @returns The dimension, or undefined for a name no vanilla dimension has. A custom dimension
 *   is known to its `Level`, not to this table.
 */
export const dimensionByName = (name: string): DimensionType | undefined => {
    const namespaced = name.includes(':') ? name : `minecraft:${name}`;
    return vanillaByJavaId.get(javaDimensionTypeOf(namespaced) ?? namespaced);
};

/**
 * The vanilla dimension a Bedrock integer id names: 0, 1 or 2.
 *
 * @returns The dimension, or undefined for any other id. A custom dimension's id is known to
 *   its `Level`, not to this table.
 */
export const dimensionByBedrockId = (bedrockId: number): DimensionType | undefined =>
    [Dimensions.Overworld, Dimensions.Nether, Dimensions.TheEnd].find((dimension) => dimension.bedrockId === bedrockId);
