import { describe, expect, it } from 'vitest';

import { mergeJavaDefinition } from './datapack';
import { MERGE_MODES, routeDatapackPath } from './javaRegistries';
import { structuralValidator } from './validation';

describe('routeDatapackPath', () => {
    it('routes the 26.3 singular directories to their registries', () => {
        expect(routeDatapackPath('data/minecraft/loot_table/blocks/stone.json')).toEqual({
            registry: 'lootTablesJava',
            identifier: 'minecraft:blocks/stone'
        });
        expect(routeDatapackPath('data/minecraft/recipe/acacia_boat.json')).toEqual({
            registry: 'recipesJava',
            identifier: 'minecraft:acacia_boat'
        });
        expect(routeDatapackPath('data/minecraft/advancement/story/root.json')).toEqual({
            registry: 'advancements',
            identifier: 'minecraft:story/root'
        });
        expect(routeDatapackPath('data/minecraft/enchantment/sharpness.json')).toEqual({
            registry: 'enchantments',
            identifier: 'minecraft:sharpness'
        });
        expect(routeDatapackPath('data/minecraft/damage_type/arrow.json')).toEqual({
            registry: 'damageTypes',
            identifier: 'minecraft:arrow'
        });
        expect(routeDatapackPath('data/mypack/predicate/lucky.json')).toEqual({
            registry: 'predicates',
            identifier: 'mypack:lucky'
        });
        expect(routeDatapackPath('data/mypack/item_modifier/sharpen.json')).toEqual({
            registry: 'itemModifiers',
            identifier: 'mypack:sharpen'
        });
    });

    it('routes an mcfunction, which is the one datapack file that is not JSON', () => {
        expect(routeDatapackPath('data/mypack/function/setup/stage.mcfunction')).toEqual({
            registry: 'functions',
            identifier: 'mypack:setup/stage'
        });
        // The plural 1.20 spelling is not the 26.3 one, and a file directly
        // under the namespace names no function.
        expect(routeDatapackPath('data/mypack/functions/setup.mcfunction')).toBeUndefined();
        expect(routeDatapackPath('data/mypack/function.mcfunction')).toBeUndefined();
    });

    it('keys tags by tagged registry plus namespaced id, with two-segment worldgen roots', () => {
        expect(routeDatapackPath('data/minecraft/tags/block/mineable/axe.json')).toEqual({
            registry: 'tags',
            identifier: 'block/minecraft:mineable/axe',
            taggedRegistry: 'block'
        });
        expect(routeDatapackPath('data/minecraft/tags/worldgen/biome/is_forest.json')).toEqual({
            registry: 'tags',
            identifier: 'worldgen/biome/minecraft:is_forest',
            taggedRegistry: 'worldgen/biome'
        });
    });

    it('ignores pre-1.21 plural directories, unconsumed registries and nested built-in packs', () => {
        expect(routeDatapackPath('data/minecraft/loot_tables/blocks/stone.json')).toBeUndefined();
        expect(routeDatapackPath('data/minecraft/worldgen/biome/plains.json')).toBeUndefined();
        expect(routeDatapackPath('data/minecraft/dimension_type/overworld.json')).toBeUndefined();
        expect(
            routeDatapackPath('data/minecraft/datapacks/trade_rebalance/data/minecraft/recipe/x.json')
        ).toBeUndefined();
    });

    it('ignores non-JSON files, files outside data/, and invalid characters', () => {
        expect(routeDatapackPath('data/minecraft/structure/igloo/top.nbt')).toBeUndefined();
        expect(routeDatapackPath('pack.mcmeta')).toBeUndefined();
        expect(routeDatapackPath('data/minecraft/recipe.json')).toBeUndefined();
        expect(routeDatapackPath('data/BAD/recipe/x.json')).toBeUndefined();
        expect(routeDatapackPath('data/minecraft/recipe/Bad Name.json')).toBeUndefined();
    });
});

describe('structuralValidator for Java registries', () => {
    it('accepts a minimal recipe, loot table, advancement and tag', () => {
        expect(
            structuralValidator({ registry: 'recipesJava', path: 'p', data: { type: 'minecraft:brewing' } })
        ).toEqual([]);
        expect(structuralValidator({ registry: 'lootTablesJava', path: 'p', data: { pools: [] } })).toEqual([]);
        expect(structuralValidator({ registry: 'advancements', path: 'p', data: { criteria: {} } })).toEqual([]);
        expect(
            structuralValidator({ registry: 'tags', path: 'p', data: { replace: true, values: ['minecraft:stone'] } })
        ).toEqual([]);
    });

    it('accepts array roots where Java allows them and rejects them elsewhere', () => {
        expect(structuralValidator({ registry: 'predicates', path: 'p', data: [] })).toEqual([]);
        expect(structuralValidator({ registry: 'itemModifiers', path: 'p', data: [] })).toEqual([]);
        expect(structuralValidator({ registry: 'recipesJava', path: 'p', data: [] })).toMatchObject([
            { severity: 'error', code: 'definition.not-an-object' }
        ]);
    });

    it('reports missing or mistyped required keys', () => {
        expect(structuralValidator({ registry: 'recipesJava', path: 'p', data: {} })).toMatchObject([
            { severity: 'error', code: 'definition.missing-key' }
        ]);
        expect(structuralValidator({ registry: 'tags', path: 'p', data: { values: 'oops' } })).toMatchObject([
            { severity: 'error', code: 'definition.missing-key' }
        ]);
        expect(
            structuralValidator({
                registry: 'damageTypes',
                path: 'p',
                data: { message_id: 'arrow', scaling: 'never', exhaustion: '0.1' }
            })
        ).toMatchObject([{ severity: 'error', code: 'definition.missing-key' }]);
    });
});

describe('MERGE_MODES', () => {
    it('gives tags the merging mode and every other 26.3 registry the overriding one', () => {
        expect(MERGE_MODES.tags).toBe('tags');
        expect(Object.entries(MERGE_MODES).filter(([, mode]) => mode !== 'override')).toEqual([['tags', 'tags']]);
    });
});

describe('mergeJavaDefinition', () => {
    it('overrides with the later file whole', () => {
        expect(mergeJavaDefinition('override', { a: 1 }, { b: 2 })).toEqual({ b: 2 });
    });

    it('concatenates tag values and lets replace discard what came before', () => {
        expect(mergeJavaDefinition('tags', { replace: false, values: ['a'] }, { values: ['b'] })).toEqual({
            replace: false,
            values: ['a', 'b']
        });
        expect(
            mergeJavaDefinition('tags', { replace: false, values: ['a'] }, { replace: true, values: ['b'] })
        ).toEqual({ replace: true, values: ['b'] });
    });

    it('assigns key by key, the later file winning per key', () => {
        expect(mergeJavaDefinition('assign', { a: 1, b: 1 }, { b: 2, c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('takes a non-object file whole, whatever the mode', () => {
        expect(mergeJavaDefinition('tags', { values: ['a'] }, [1, 2])).toEqual([1, 2]);
    });
});
