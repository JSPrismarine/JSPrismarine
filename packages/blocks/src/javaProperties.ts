import { BEDROCK_ONLY_BLOCKS, bedrockBlockPropertiesOf, bedrockBlockStateOverridesOf } from '@jsprismarine/mapping';

import type { BlockPropertySource } from './overlay';

/**
 * The Java-sourced property table as the overlay generator reads it: the
 * 1295 rows `@jsprismarine/mapping` flattened out of the Java 26.3 jar dump,
 * plus the 182 Bedrock-only identifiers it publishes no row for.
 *
 * One overlay file covers every state of its block, so the generator writes a
 * block's base row as its components and a lit candle's or an unlit
 * campfire's light as a permutation from the per-state overrides.
 */
export const JAVA_BLOCK_PROPERTIES: BlockPropertySource = {
    bedrockOnly: BEDROCK_ONLY_BLOCKS,
    propertiesOf: (identifier) => bedrockBlockPropertiesOf(identifier),
    stateOverridesOf: (identifier) => bedrockBlockStateOverridesOf(identifier)
};
