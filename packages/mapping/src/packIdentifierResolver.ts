import type { IdentifierResolver } from '@jsprismarine/packs';
import { javaBlockStateToBedrock } from './blockMapping';
import { javaEntityTypeToBedrock } from './entityMapping';
import { javaItemToBedrock } from './itemMapping';
import { javaIdentifierToBedrock } from './registryMapping';

/**
 * How one Java identifier resolves against the mapping tables: `known` has a
 * Bedrock identifier, `loss` is on the reviewed loss list, `unknown` is
 * neither. Structurally identical to the `IdentifierResolution` type of
 * `@jsprismarine/packs`, which defines the seam this package fills.
 */
export type PackIdentifierResolution = 'known' | 'loss' | 'unknown';

/**
 * Resolves Java identifiers per registry, in the shape the
 * `@jsprismarine/packs` identifier report injects.
 */
export interface PackIdentifierResolver {
    /**
     * Resolves one referenced identifier.
     *
     * @param registry - The Java registry the reference points into, such as `item` or `block`.
     * @param javaId - The namespaced id; tag references keep their `#` prefix.
     */
    resolve(registry: string, javaId: string): PackIdentifierResolution;
}

/**
 * The lookups per packs-report registry name. The report names registries the
 * way datapack files do (`entity_type`, `worldgen/biome`); each covered name
 * routes to this package's lookup for that domain.
 */
const LOOKUPS: Readonly<Record<string, (javaId: string) => { readonly kind: string }>> = {
    item: javaItemToBedrock,
    block: (javaId) => javaBlockStateToBedrock(javaId),
    entity_type: javaEntityTypeToBedrock,
    enchantment: (javaId) => javaIdentifierToBedrock('enchantment', javaId),
    'worldgen/biome': (javaId) => javaIdentifierToBedrock('biome', javaId)
};

/**
 * Creates the resolver `reportIdentifiers` in `@jsprismarine/packs` accepts,
 * answered from this package's mapping tables. Items, blocks, entity types,
 * biomes and enchantments resolve through their lookups: `mapped` and
 * `passthrough` results report as `known`, reviewed losses as `loss`.
 * Tag references (`#`-prefixed) and registries the tables do not cover, such
 * as `fluid` or `loot_table`, report as `unknown`.
 */
export const createPackIdentifierResolver = (): PackIdentifierResolver =>
    ({
        resolve: (registry, javaId) => {
            const lookup = LOOKUPS[registry];
            if (lookup === undefined || javaId.startsWith('#')) return 'unknown';
            const { kind } = lookup(javaId);
            if (kind === 'loss') return 'loss';
            return kind === 'mapped' || kind === 'passthrough' ? 'known' : 'unknown';
        }
    }) satisfies IdentifierResolver;
