import type { IdentifierResolver } from '@jsprismarine/packs';
import { javaBlockStateToBedrock } from './blockMapping';
import { javaEntityTypeToBedrock } from './entityMapping';
import { javaItemToBedrock } from './itemMapping';
import { UNTRANSLATED_REGISTRIES } from './lossList';
import { SERVER_SIDE_REGISTRIES } from './packRegistries';
import { javaIdentifierToBedrock } from './registryMapping';
import { javaIdentifiersTable } from './tables';

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
    mob_effect: (javaId) => javaIdentifierToBedrock('mob_effect', javaId),
    potion: (javaId) => javaIdentifierToBedrock('potion', javaId),
    'worldgen/biome': (javaId) => javaIdentifierToBedrock('biome', javaId)
};

/** The registries the census answers, and whether a hit there is a reviewed loss. */
const CENSUS_RESOLUTIONS: ReadonlyMap<string, PackIdentifierResolution> = new Map([
    ...SERVER_SIDE_REGISTRIES.map((entry) => [entry.registry, 'known'] as const),
    ...UNTRANSLATED_REGISTRIES.map((entry) => [entry.registry, 'loss'] as const)
]);

/** The census as sets, built once: a load asks about the same registry thousands of times. */
const CENSUS: ReadonlyMap<string, ReadonlySet<string>> = new Map(
    Object.entries(javaIdentifiersTable.registries).map(([registry, ids]) => [registry, new Set(ids)])
);

/**
 * Creates the resolver `reportIdentifiers` in `@jsprismarine/packs` accepts,
 * answered from this package's generated tables.
 *
 * Three answers, in the order they are tried. Items, blocks, entity types,
 * biomes, enchantments, mob effects and potions go through their mapping
 * lookup: `mapped` and `passthrough` report as `known`, reviewed losses as
 * `loss`. A registry with no Bedrock table goes to the generated Java 26.3
 * census instead, which says only that the identifier is a real entry of
 * that registry; that reports as `known` when the server evaluates the
 * registry in Java's own shape, and as `loss` when the value does reach a
 * Bedrock client but this package cannot name it yet. Everything else is
 * `unknown`, which is what makes a strict loader refuse to start.
 *
 * Tag references are not this resolver's to answer: a `#tag` resolves
 * against the tags the pack stack loaded, which only the report can see, so
 * `reportIdentifiers` handles those and anything reaching here with a `#`
 * is `unknown`.
 *
 * @returns {PackIdentifierResolver} A resolver over the pinned tables; it holds no state, so one instance serves every load.
 * @example
 * ```typescript
 * const resolver = createPackIdentifierResolver();
 * resolver.resolve('item', 'minecraft:stone'); // 'known'
 * resolver.resolve('game_event', 'minecraft:step'); // 'known', server-side
 * resolver.resolve('painting_variant', 'minecraft:kebab'); // 'loss'
 * resolver.resolve('item', 'minecraft:not_an_item'); // 'unknown'
 * ```
 */
export const createPackIdentifierResolver = (): PackIdentifierResolver =>
    ({
        resolve: (registry, javaId) => {
            if (javaId.startsWith('#')) return 'unknown';

            const lookup = LOOKUPS[registry];
            if (lookup !== undefined) {
                const { kind } = lookup(javaId);
                if (kind === 'loss') return 'loss';
                return kind === 'mapped' || kind === 'passthrough' ? 'known' : 'unknown';
            }

            const census = CENSUS_RESOLUTIONS.get(registry);
            if (census === undefined) return 'unknown';
            // There is no passthrough here. A custom namespace passes through
            // for items and blocks because a Bedrock client can be taught
            // them; a custom structure or game event has no such path, so
            // only an entry the pinned Java data publishes resolves.
            return CENSUS.get(registry)?.has(javaId) === true ? census : 'unknown';
        }
    }) satisfies IdentifierResolver;
