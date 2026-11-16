import { EntityTypes } from '@jsprismarine/entities';
import type { Definition } from '@jsprismarine/packs';
import { describe, expect, it } from 'vitest';

import { buildContentTags } from '../content/tags';
import { javaBreedingFoods, withJavaBreedingFood } from './javaBreedingFood';

const tagFile = (identifier: string, values: readonly string[]): readonly [string, Definition] => [
    identifier,
    { identifier, registry: 'tags', pack: 'vanilla', path: `data/${identifier}.json`, data: { values } }
];

const tags = buildContentTags(
    new Map([
        tagFile('item/minecraft:fishes', ['minecraft:cod', 'minecraft:salmon']),
        tagFile('item/minecraft:wolf_food', ['minecraft:beef', 'minecraft:mutton', '#minecraft:fishes']),
        tagFile('item/minecraft:axolotl_food', ['minecraft:tropical_fish_bucket'])
    ])
);

const entityFile = (identifier: string, breedable: unknown, grouped = false) => ({
    format_version: '1.21.0',
    'minecraft:entity': {
        description: { identifier, is_spawnable: true, is_summonable: true },
        components: grouped ? { 'minecraft:health': { value: 8, max: 8 } } : { 'minecraft:breedable': breedable },
        ...(grouped ? { component_groups: { adult: { 'minecraft:breedable': breedable } } } : {})
    }
});

/** The items a loaded entity's breedable accepts, read through the real component. */
const accepts = (data: unknown, identifier: string, items: readonly string[]): readonly string[] => {
    const types = new EntityTypes();
    types.load([{ data, pack: 'test', path: 'entities/test.json' }]);
    const entity = types.spawn(identifier);
    return items.filter((item) => entity.interactWithItem(item));
};

describe('withJavaBreedingFood', () => {
    it("feeds a wolf Java's wolf_food, fish and all, where Bedrock's list has none", () => {
        const data = withJavaBreedingFood(
            entityFile('minecraft:wolf', { require_tame: false, breed_items: ['beef', 'muttonRaw'] }),
            javaBreedingFoods(tags)
        );

        expect(
            accepts(data, 'minecraft:wolf', ['minecraft:beef', 'minecraft:mutton', 'minecraft:cod', 'minecraft:salmon'])
        ).toEqual(['minecraft:beef', 'minecraft:mutton', 'minecraft:cod', 'minecraft:salmon']);
    });

    it('keeps the empty bucket an axolotl hands back for the bucket of fish both editions accept', () => {
        const data = withJavaBreedingFood(
            entityFile(
                'minecraft:axolotl',
                {
                    require_tame: false,
                    breed_items: [{ item: 'tropical_fish_bucket', result_item: 'water_bucket:0' }, 'kelp']
                },
                true
            ),
            javaBreedingFoods(tags)
        );

        const types = new EntityTypes();
        types.load([{ data, pack: 'test', path: 'entities/axolotl.json' }]);
        const axolotl = types.spawn('minecraft:axolotl');
        axolotl.restoreComponentGroups(['adult']);
        expect(axolotl.interactWithItemResult('minecraft:tropical_fish_bucket')).toMatchObject({
            breed: true,
            resultItem: expect.stringContaining('water_bucket')
        });
        expect(axolotl.interactWithItem('minecraft:kelp')).toBe(false);
    });

    it('gives an animal with no Java tag the modern names of the items its pack lists', () => {
        const data = withJavaBreedingFood(
            entityFile('minecraft:horse', { require_tame: false, breed_items: ['golden_carrot', 'appleEnchanted'] }),
            javaBreedingFoods(tags)
        );

        expect(
            accepts(data, 'minecraft:horse', ['minecraft:golden_carrot', 'minecraft:enchanted_golden_apple'])
        ).toEqual(['minecraft:golden_carrot', 'minecraft:enchanted_golden_apple']);
    });

    it('returns a file with no breedable unchanged', () => {
        const data = entityFile('minecraft:zombie', undefined, false);
        const bare = { ...data, 'minecraft:entity': { ...data['minecraft:entity'], components: {} } };
        expect(withJavaBreedingFood(bare, javaBreedingFoods(tags))).toBe(bare);
    });
});
