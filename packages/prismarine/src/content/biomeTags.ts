/**
 * The biome tags of a pack stack's `biomes/` registry.
 *
 * Bedrock puts a biome's tags in its definition, under the `minecraft:tags` component, as bare
 * names rather than namespaced identifiers: the plains carry `animal`, `monster`, `overworld`,
 * `plains` and `bee_habitat`. They are what a spawn rule's `has_biome_tag` compares, and the
 * only thing this server reads out of a biome definition, so this is a tag index rather than a
 * biome parser. Everything else in the file - the climate, the surface builder, the multinoise
 * rules - belongs to world generation, which reads Java's biome documents instead.
 *
 * A definition that does not carry the component, or carries it malformed, has no tags. The
 * pack loader already validates biomes against Mojang's published schema, so a shape this
 * cannot read is a file the stack reported on, not a fact to invent a default for.
 */
import type { Definition } from '@jsprismarine/packs';

/** The tags of each biome in a pack stack, keyed by the biome's namespaced identifier. */
export type BiomeTagIndex = ReadonlyMap<string, readonly string[]>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** The `minecraft:tags` names of one biome definition's parsed data. */
const tagsOf = (data: unknown): readonly string[] => {
    if (!isRecord(data)) return [];
    const biome = data['minecraft:biome'];
    if (!isRecord(biome)) return [];
    const components = biome['components'];
    if (!isRecord(components)) return [];
    const component = components['minecraft:tags'];
    if (!isRecord(component)) return [];
    const tags = component['tags'];
    if (!Array.isArray(tags)) return [];

    const names: string[] = [];
    for (const tag of tags) if (typeof tag === 'string') names.push(tag);
    return names;
};

/**
 * Indexes the biome tags of a pack stack's `biomes/` registry.
 *
 * @param {Iterable<readonly [string, Definition]>} biomes - The registry, which iterates as identifier and definition pairs.
 * @returns {BiomeTagIndex} Every biome in the registry, each with its tags, which may be empty.
 * @example
 * ```typescript
 * parseBiomeTags(content.biomes).get('minecraft:plains'); // ['animal', 'monster', 'overworld', ...]
 * ```
 */
export const parseBiomeTags = (biomes: Iterable<readonly [string, Definition]>): BiomeTagIndex => {
    const index = new Map<string, readonly string[]>();
    for (const [identifier, definition] of biomes) index.set(identifier, tagsOf(definition.data));
    return index;
};
