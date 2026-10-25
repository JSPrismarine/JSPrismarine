/**
 * The chunk boundary where Java states become Bedrock ones.
 *
 * `@jsprismarine/worldgen`, `@jsprismarine/features` and `@jsprismarine/structures` all speak
 * Java Edition identifiers, because that is what Mojang's published data names. The server
 * stores Bedrock runtime ids. A lookup through `@jsprismarine/mapping` costs about 95
 * microseconds a column, so it happens once per generated chunk and never per block read: this
 * module memoizes the translation by state, which collapses a chunk's roughly 18000 placements
 * onto the handful of distinct states a chunk actually holds.
 */
import { javaBlockStateToBedrock, javaIdentifierToBedrock } from '@jsprismarine/mapping';

import { BlockRuntimeIds, UNKNOWN_RUNTIME_ID } from '../../../block/state/BlockRuntimeIds';
import { PLAINS_BIOME } from '../../chunk/ChunkBiomes';
import { BEDROCK_BIOME_IDS } from './bedrockBiomeIds';

/** A Java block state: an identifier and the property values that pick one state of it. */
export interface JavaState {
    readonly name: string;
    readonly properties?: Readonly<Record<string, string>>;
}

/** The cache key for one Java state, properties in alphabetical order. */
const keyOf = (name: string, properties: Readonly<Record<string, string>> | undefined): string => {
    const keys = properties === undefined ? [] : Object.keys(properties).sort();
    if (keys.length === 0) return name;

    return `${name}[${keys.map((key) => `${key}=${properties![key]}`).join(',')}]`;
};

/**
 * Translates Java block states to the runtime ids a chunk stores.
 *
 * One of these lives for as long as the generator does, so a world pays for each distinct
 * state once rather than once per chunk.
 */
export class JavaStateTranslator {
    private readonly runtimeIds = new Map<string, number>();
    private readonly unmapped = new Set<string>();

    /**
     * The runtime id for a Java state.
     *
     * @returns The id, or {@link UNKNOWN_RUNTIME_ID} when the Java state has no Bedrock
     *   equivalent this server's palette knows. Callers place nothing for that rather than
     *   substituting a block, so a gap is visible as a hole and not as the wrong terrain.
     */
    public runtimeIdOf(name: string, properties?: Readonly<Record<string, string>>): number {
        const key = keyOf(name, properties);
        const cached = this.runtimeIds.get(key);
        if (cached !== undefined) return cached;

        const runtimeId = this.translate(name, properties);
        this.runtimeIds.set(key, runtimeId);
        return runtimeId;
    }

    /** Every Java state the translator could not place, for a generator to report once. */
    public unmappedStates(): readonly string[] {
        return [...this.unmapped];
    }

    private translate(name: string, properties: Readonly<Record<string, string>> | undefined): number {
        const mapped = javaBlockStateToBedrock(name, properties);
        if (mapped.kind === 'unknown') {
            this.unmapped.add(keyOf(name, properties));
            return UNKNOWN_RUNTIME_ID;
        }

        const runtimeId = BlockRuntimeIds.tryGetByState(mapped.bedrock.name, mapped.bedrock.states);
        if (runtimeId === null) {
            this.unmapped.add(keyOf(name, properties));
            return UNKNOWN_RUNTIME_ID;
        }

        return runtimeId;
    }
}

/**
 * The number the Bedrock client calls a Java biome.
 *
 * Two steps, because the two halves live in different places: `@jsprismarine/mapping` owns
 * which Bedrock biome a Java one is, and {@link BEDROCK_BIOME_IDS} owns what the client
 * numbers that biome.
 *
 * @returns The client's id, or plains for a Java biome with no Bedrock counterpart. Plains
 *   rather than a refusal because a biome id travels in every chunk payload and the client
 *   draws nothing at all for an id it does not know.
 */
export const bedrockBiomeIdOf = (javaBiome: string): number => {
    const mapped = javaIdentifierToBedrock('biome', javaBiome);
    const bedrock =
        mapped.kind === 'loss' ? mapped.loss.bedrockFallback : mapped.kind === 'unknown' ? undefined : mapped.bedrock;

    return (bedrock === undefined ? undefined : BEDROCK_BIOME_IDS[bedrock]) ?? PLAINS_BIOME;
};
