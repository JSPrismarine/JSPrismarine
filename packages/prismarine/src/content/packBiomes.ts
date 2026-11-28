/**
 * The biomes behavior packs add, outside the `minecraft` namespace, and the numeric id each one
 * takes.
 *
 * BDS 1.26.60.6 adds a pack's biomes to the join's `BiomeDefinitionList` after the vanilla
 * ones, numbered from 30000, and fills a chunk of a pack dimension whose default biome is one of
 * them with that number. Fields a biome's components leave out take the values BDS sent for a
 * biome with none; `BiomeDefinitionListPacket.test.ts` holds that capture.
 */
import type { Registry } from '@jsprismarine/content';
import { bedrockBiomeToJava } from '@jsprismarine/mapping';
import type { Definition } from '@jsprismarine/packs';
import type { BiomeDefinitionEntry } from '@jsprismarine/protocol/bedrock/packet/BiomeDefinitionListPacket';

import { isRecord } from '../utils/isRecord';

/** The id BDS gives the first pack biome. */
export const FIRST_PACK_BIOME_ID = 30000;

/** What BDS sends for each field a pack biome's components leave out. */
const DEFAULTS = {
    temperature: 0.5,
    downfall: 0.5,
    foliageSnow: 0,
    depth: 0.1,
    scale: 0.2,
    mapWaterColor: -1503610881,
    rain: true
} as const;

/** A component's object, or undefined. */
const componentOf = (data: unknown, key: string): Record<string, unknown> | undefined => {
    const biome = isRecord(data) ? data['minecraft:biome'] : undefined;
    const components = isRecord(biome) ? biome.components : undefined;
    const component = isRecord(components) ? components[key] : undefined;
    return isRecord(component) ? component : undefined;
};

/** A number field, or its default. */
const numberOr = (from: Record<string, unknown> | undefined, key: string, fallback: number): number => {
    const value = from?.[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

/** One pack biome's entry. */
const entryOf = (name: string, id: number, data: unknown): BiomeDefinitionEntry => {
    const climate = componentOf(data, 'minecraft:climate');
    const tags = componentOf(data, 'minecraft:tags')?.tags;
    return {
        ...DEFAULTS,
        name,
        id,
        temperature: numberOr(climate, 'temperature', DEFAULTS.temperature),
        downfall: numberOr(climate, 'downfall', DEFAULTS.downfall),
        tags: Array.isArray(tags) ? tags.filter((tag) => typeof tag === 'string') : []
    };
};

const cache = new WeakMap<Registry<Definition>, readonly BiomeDefinitionEntry[]>();

/**
 * The pack biomes among the content's biome definitions, in identifier order, each with its id.
 * The order is the server's own: ids follow the identifiers, so a pack that keeps its biomes
 * keeps their ids, which the chunks of its dimensions are saved with.
 */
export const packBiomesOf = (biomes: Registry<Definition>): readonly BiomeDefinitionEntry[] => {
    const cached = cache.get(biomes);
    if (cached !== undefined) return cached;
    const names = biomes
        .keys()
        // A pack cannot add a biome to the `minecraft` namespace, only override one, and the
        // mapping table can lag a release behind the vanilla biomes, so the namespace decides.
        .filter((name) => !name.startsWith('minecraft:'))
        .toSorted();
    const entries = names.map((name, index) => entryOf(name, FIRST_PACK_BIOME_ID + index, biomes.get(name)?.data));
    cache.set(biomes, entries);
    return entries;
};

/**
 * The numeric id chunks carry for a Bedrock biome: a vanilla biome's own, or a pack biome's.
 * @returns Undefined for a biome neither the vanilla table nor a pack defines.
 */
export const bedrockBiomeIdIn = (biomes: Registry<Definition>, name: string): number | undefined => {
    const vanilla = bedrockBiomeToJava(name);
    if (vanilla.kind !== 'unknown') return vanilla.bedrock.id;
    return packBiomesOf(biomes).find((biome) => biome.name === name)?.id;
};
