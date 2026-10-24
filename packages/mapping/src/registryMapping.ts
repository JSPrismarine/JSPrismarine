import type { RegistryLoss } from './lossList';
import { REGISTRY_LOSSES } from './lossList';
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
