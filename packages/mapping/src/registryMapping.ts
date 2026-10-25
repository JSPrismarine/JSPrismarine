import type { BedrockBiomeLoss, RegistryLoss } from './lossList';
import { BEDROCK_BIOME_LOSSES, REGISTRY_LOSSES } from './lossList';
import { registriesTable } from './tables';

/** The registries beyond blocks, items and entities that this package maps. */
export const MAPPED_REGISTRIES = ['biome', 'enchantment'] as const;
/** One of {@link MAPPED_REGISTRIES}. */
export type MappedRegistry = (typeof MAPPED_REGISTRIES)[number];

/** What a Java registry identifier lookup produced. */
export type IdentifierMappingResult =
    /** A Bedrock identifier the pinned data set knows. */
    | { readonly kind: 'mapped'; readonly bedrock: string }
    /**
     * A reviewed loss. Merged biomes carry the shared Bedrock biome in
     * `loss.bedrockFallback`; `sweeping_edge` carries no fallback because
     * Bedrock has no id for it at all.
     */
    | { readonly kind: 'loss'; readonly loss: RegistryLoss }
    /** A non-`minecraft:` identifier, passed through untouched for custom content. */
    | { readonly kind: 'passthrough'; readonly bedrock: string }
    /** Not a Java 26.3 entry of the registry. */
    | { readonly kind: 'unknown'; readonly registry: MappedRegistry; readonly javaId: string };

const registryLossById = new Map<string, RegistryLoss>(
    REGISTRY_LOSSES.map((loss) => [`${loss.registry} ${loss.javaId}`, loss])
);

/**
 * Maps one Java 26.3 identifier of the named registry to its Bedrock 1.26.51
 * identifier. Total over the registry's vanilla entries: every entry returns
 * `mapped` or a reviewed `loss`, never `undefined`. Non-`minecraft:`
 * identifiers pass through untouched.
 */
export const javaIdentifierToBedrock = (registry: MappedRegistry, javaId: string): IdentifierMappingResult => {
    if (!javaId.startsWith('minecraft:')) return { kind: 'passthrough', bedrock: javaId };
    const loss = registryLossById.get(`${registry} ${javaId}`);
    if (loss !== undefined) return { kind: 'loss', loss };
    const bedrock = registriesTable[registry][javaId];
    if (bedrock === undefined) return { kind: 'unknown', registry, javaId };
    return { kind: 'mapped', bedrock };
};

/** One Bedrock biome: what a chunk stores it as, and what the client calls it. */
export interface BedrockBiome {
    /**
     * The number a chunk stores and the client resolves grass color, fog and ambient sound
     * from. Mojang's own, not a registry position, so it cannot be derived from the name.
     */
    readonly id: number;
    /** The namespaced Bedrock biome identifier, such as `minecraft:mesa`. */
    readonly identifier: string;
}

/** What a Bedrock biome lookup produced. */
export type BedrockBiomeResult =
    /** A Bedrock biome with a Java 26.3 biome behind it. */
    | { readonly kind: 'mapped'; readonly bedrock: BedrockBiome; readonly java: string }
    /**
     * A reviewed loss: one of the 27 legacy Bedrock biomes Java 26.3 has no identifier for.
     * The Bedrock side is still known, so a caller that only wanted the identifier has it.
     */
    | { readonly kind: 'loss'; readonly bedrock: BedrockBiome; readonly loss: BedrockBiomeLoss }
    /** Neither a pinned Bedrock biome id nor a pinned Bedrock biome identifier. */
    | { readonly kind: 'unknown'; readonly biome: number | string };

const bedrockBiomeById = new Map(
    Object.entries(registriesTable.bedrockBiomes).map(([identifier, entry]) => [entry.id, identifier])
);

const bedrockBiomeLossById = new Map<string, BedrockBiomeLoss>(
    BEDROCK_BIOME_LOSSES.map((loss) => [loss.bedrockId, loss])
);

/**
 * The inverse of the biome half of {@link javaIdentifierToBedrock}: resolves what a chunk
 * stores back to the Bedrock biome, and to the Java 26.3 biome that produced it.
 *
 * Total over the pinned Bedrock biomes, which is every biome the generated world can hold:
 * each returns `mapped` or a reviewed `loss`, never `undefined`. Where several Java biomes
 * share one Bedrock biome - the River takes `the_void` as well, and the End takes all five of
 * Java's End biomes - the result names the Java biome the Bedrock one is the counterpart of,
 * which is the one {@link import('./lossList').REGISTRY_LOSSES} does not list.
 *
 * There is no `passthrough` variant, because a custom biome has no vanilla id to be stored
 * as; an identifier the pinned data does not have is `unknown` whichever namespace it is in.
 *
 * @param {number | string} biome - The numeric id a chunk stores, or the Bedrock identifier.
 * @returns {BedrockBiomeResult} The Bedrock biome and its Java source, a reviewed loss, or `unknown`.
 * @example
 * ```typescript
 * bedrockBiomeToJava(37); // { kind: 'mapped', bedrock: { id: 37, identifier: 'minecraft:mesa' }, java: 'minecraft:badlands' }
 * bedrockBiomeToJava('minecraft:taiga_hills'); // { kind: 'loss', bedrock: { id: 19, ... }, loss: { reason: ... } }
 * ```
 */
export const bedrockBiomeToJava = (biome: number | string): BedrockBiomeResult => {
    const identifier = typeof biome === 'number' ? bedrockBiomeById.get(biome) : biome;
    const entry = identifier === undefined ? undefined : registriesTable.bedrockBiomes[identifier];
    if (identifier === undefined || entry === undefined) return { kind: 'unknown', biome };

    const bedrock: BedrockBiome = { id: entry.id, identifier };
    if (entry.java !== undefined) return { kind: 'mapped', bedrock, java: entry.java };

    const loss = bedrockBiomeLossById.get(identifier);
    // The generator refuses to emit a Bedrock biome that has neither a Java source nor a
    // reviewed loss, so this is unreachable with the committed table.
    if (loss === undefined) throw new Error(`${identifier} has no Java source and no reviewed loss`);
    return { kind: 'loss', bedrock, loss };
};
