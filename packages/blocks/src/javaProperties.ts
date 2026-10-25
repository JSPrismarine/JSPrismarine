import { BEDROCK_ONLY_BLOCKS, bedrockBlockPropertiesOf } from '@jsprismarine/mapping';

import type { BlockPropertySource } from './overlay';

/**
 * The Java-sourced property table as the overlay generator reads it: the
 * 1295 rows `@jsprismarine/mapping` flattened out of the Java 26.3 jar dump,
 * plus the 182 Bedrock-only identifiers it publishes no row for.
 *
 * The generator takes a block's base row only, with no state values, because
 * one overlay file covers every state of its block. The per-state overrides a
 * lit candle or an extended piston needs come from the behavior family, not
 * from the pack.
 */
export const JAVA_BLOCK_PROPERTIES: BlockPropertySource = {
    bedrockOnly: BEDROCK_ONLY_BLOCKS,
    propertiesOf: (identifier) => bedrockBlockPropertiesOf(identifier)
};
