import { defineErrors } from '@jsprismarine/errors/JSPrismarineError';

/** The errors `@jsprismarine/mapping` throws. */
export const MappingErrors = defineErrors('mapping', {
    /**
     * A Bedrock biome has neither a Java biome it maps from nor a reviewed entry saying why not.
     * The generated mapping tables are stale; regenerate them.
     */
    UnmappedBiome: '{identifier} has no Java source and no reviewed loss'
});
