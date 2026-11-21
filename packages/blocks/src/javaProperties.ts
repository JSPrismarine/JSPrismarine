import { BEDROCK_ONLY_BLOCKS, bedrockBlockPropertiesOf, bedrockBlockStateOverridesOf } from '@jsprismarine/mapping';

import type { BlockPropertySource } from './overlay';

/**
 * The Java-sourced property table as the overlay generator reads it: the
 * 1295 rows `@jsprismarine/mapping` flattened out of the Java 26.3 jar dump,
 * plus the 182 Bedrock-only identifiers it publishes no row for.
 *
 * The generator takes a block's base row for its components, because one
 * overlay file covers every state of its block, and the per-state overrides
 * for the light a lit candle or a charged respawn anchor gives, which it
 * writes as permutations.
 */
export const JAVA_BLOCK_PROPERTIES: BlockPropertySource = {
    bedrockOnly: BEDROCK_ONLY_BLOCKS,
    propertiesOf: (identifier) => bedrockBlockPropertiesOf(identifier),
    stateOverridesOf: (identifier) => bedrockBlockStateOverridesOf(identifier)
};
