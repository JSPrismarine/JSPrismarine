import { Registry } from '@jsprismarine/content';
import type { Definition } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import { bedrockBiomeIdIn, FIRST_PACK_BIOME_ID, packBiomesOf } from './packBiomes';

/** A biome registry holding definitions with the given components, as packs load them. */
const biomesOf = (biomes: Record<string, Record<string, unknown>>): Registry<Definition> => {
    const registry = new Registry<Definition>('biomes');
    registry.rebuild(
        new Map(
            Object.entries(biomes).map(([identifier, components]) => [
                identifier,
                {
                    identifier,
                    registry: 'biomes',
                    pack: 'Test',
                    path: `biomes/${identifier}.json`,
                    data: { 'minecraft:biome': { description: { identifier }, components } }
                }
            ])
        )
    );
    return registry;
};

describe('packBiomesOf', () => {
    const biomes = biomesOf({
        'minecraft:plains': {},
        'jsp:meadow': {
            'minecraft:climate': { temperature: 0.6, downfall: 0.4 },
            'minecraft:tags': { tags: ['jsp', 'meadow'] }
        },
        'jsp:bare': {}
    });

    it('numbers the biomes outside the minecraft namespace from 30000, in identifier order', () => {
        expect(packBiomesOf(biomes).map(({ name, id }) => [name, id])).toEqual([
            ['jsp:bare', FIRST_PACK_BIOME_ID],
            ['jsp:meadow', FIRST_PACK_BIOME_ID + 1]
        ]);
    });

    it("reads a biome's climate and tags, and gives what it leaves out BDS's values", () => {
        const [bare, meadow] = packBiomesOf(biomes);

        expect(meadow).toMatchObject({ temperature: 0.6, downfall: 0.4, tags: ['jsp', 'meadow'] });
        expect(bare).toMatchObject({ temperature: 0.5, downfall: 0.5, depth: 0.1, scale: 0.2, rain: true, tags: [] });
    });

    it('finds the chunk id of a vanilla biome and of a pack biome, and none for an unknown one', () => {
        expect(bedrockBiomeIdIn(biomes, 'minecraft:ocean')).toBe(0);
        expect(bedrockBiomeIdIn(biomes, 'jsp:meadow')).toBe(FIRST_PACK_BIOME_ID + 1);
        expect(bedrockBiomeIdIn(biomes, 'jsp:missing')).toBeUndefined();
    });
});
