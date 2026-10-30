import type { Generator } from '@jsprismarine/minecraft';

import { dimensionsTable } from './tables';

/**
 * What the Bedrock client needs to know about a Java dimension type that
 * Java's `dimension_type` JSON does not say: the integer id, the client's
 * spelling of the name, the height clamp and the `StartGame` generator value.
 *
 * A Java type with no overlay is a custom dimension. It gets an id from 1000
 * up in stem order and is announced through `DimensionDataPacket`, which is
 * the caller's job, not this table's.
 */
export interface BedrockDimensionOverlay {
    /** The integer the client, the LevelDB chunk key and `ChangeDimension` use: 0, 1 or 2. */
    readonly dimensionId: number;
    /** The client's spelling of the dimension, `minecraft:nether` for Java's `minecraft:the_nether`. */
    readonly bedrockName: string;
    /**
     * The client's floor, present only where it differs from the Java type.
     * Absent for all three vanilla rows today; the Java type's `min_y` applies.
     */
    readonly minY?: number;
    /**
     * The client's height, present only where it differs from the Java type.
     * The Nether carries 128: Java's type says 256 with `logical_height` 128,
     * and the client discards or crashes on sub chunks above 128.
     */
    readonly height?: number;
    /** The `Generator` enum value `StartGame` carries: `OVERWORLD` 1, `NETHER` 3, `END` 4. */
    readonly generatorType: Generator;
}

const overlayByJavaId: ReadonlyMap<string, BedrockDimensionOverlay> = new Map(
    Object.entries(dimensionsTable.dimensions)
);

const javaIdByBedrockName: ReadonlyMap<string, string> = new Map(
    Object.entries(dimensionsTable.dimensions).map(([javaId, row]) => [row.bedrockName, javaId])
);

/**
 * The Bedrock side of a Java `dimension_type` id, or `undefined` for a type
 * the client has no built-in dimension for.
 *
 * @param javaDimensionTypeId - A Java 26.3 `dimension_type` id such as `minecraft:the_nether`.
 * @example
 * ```typescript
 * bedrockDimensionOverlay('minecraft:the_nether');
 * // { dimensionId: 1, bedrockName: 'minecraft:nether', minY: 0, height: 128, generatorType: 3 }
 * bedrockDimensionOverlay('mypack:sky'); // undefined
 * ```
 */
export const bedrockDimensionOverlay = (javaDimensionTypeId: string): BedrockDimensionOverlay | undefined =>
    overlayByJavaId.get(javaDimensionTypeId);

/**
 * The inverse of {@link bedrockDimensionOverlay} on the name: the Java
 * `dimension_type` id behind a Bedrock dimension name, or `undefined` when no
 * row spells its name that way. Only Bedrock spellings match, so
 * `minecraft:nether` answers `minecraft:the_nether` and `minecraft:the_nether`
 * itself answers `undefined`; a caller that accepts either spelling falls back
 * to its input.
 */
export const javaDimensionTypeOf = (bedrockName: string): string | undefined => javaIdByBedrockName.get(bedrockName);
