import { describe, expect, it } from 'vitest';

import { mergeJavaDefinition } from './datapack';
import { MERGE_MODES, WORLDGEN_REGISTRY_KINDS, routeDatapackPath } from './javaRegistries';
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

    it('routes dimension types and level stems by namespaced id', () => {
        expect(routeDatapackPath('data/minecraft/dimension_type/overworld.json')).toEqual({
            registry: 'dimensionTypes',
            identifier: 'minecraft:overworld'
        });
        expect(routeDatapackPath('data/mypack/dimension/skylands.json')).toEqual({
            registry: 'dimensions',
            identifier: 'mypack:skylands'
        });
    });

    it('routes every worldgen kind into one registry keyed by kind then namespaced id', () => {
        expect(routeDatapackPath('data/minecraft/worldgen/noise_settings/overworld.json')).toEqual({
            registry: 'worldgen',
            identifier: 'noise_settings/minecraft:overworld',
            worldgenKind: 'noise_settings'
        });
        expect(routeDatapackPath('data/minecraft/worldgen/biome/plains.json')).toEqual({
            registry: 'worldgen',
            identifier: 'biome/minecraft:plains',
            worldgenKind: 'biome'
        });
        expect(routeDatapackPath('data/minecraft/worldgen/world_preset/normal.json')).toEqual({
            registry: 'worldgen',
            identifier: 'world_preset/minecraft:normal',
            worldgenKind: 'world_preset'
        });
        expect(routeDatapackPath('data/minecraft/worldgen/flat_level_generator_preset/classic_flat.json')).toEqual({
            registry: 'worldgen',
            identifier: 'flat_level_generator_preset/minecraft:classic_flat',
            worldgenKind: 'flat_level_generator_preset'
        });
        expect(
            routeDatapackPath('data/minecraft/worldgen/multi_noise_biome_source_parameter_list/nether.json')
        ).toEqual({
            registry: 'worldgen',
            identifier: 'multi_noise_biome_source_parameter_list/minecraft:nether',
            worldgenKind: 'multi_noise_biome_source_parameter_list'
        });
        // A nested path keeps its directories, as the structure files do.
        expect(routeDatapackPath('data/minecraft/worldgen/density_function/overworld/sloped_cheese.json')).toEqual({
            registry: 'worldgen',
            identifier: 'density_function/minecraft:overworld/sloped_cheese',
            worldgenKind: 'density_function'
        });

        for (const kind of WORLDGEN_REGISTRY_KINDS) {
            expect(routeDatapackPath(`data/mypack/worldgen/${kind}/example.json`)).toEqual({
                registry: 'worldgen',
                identifier: `${kind}/mypack:example`,
                worldgenKind: kind
            });
        }
        expect(WORLDGEN_REGISTRY_KINDS).toContain('block_state_provider');
        expect(WORLDGEN_REGISTRY_KINDS).toContain('template_pool');
    });

    it('ignores a worldgen kind it does not route and a kind directory with no file', () => {
        expect(routeDatapackPath('data/minecraft/worldgen/configured_surface_builder/x.json')).toBeUndefined();
        expect(routeDatapackPath('data/minecraft/worldgen/biome.json')).toBeUndefined();
        expect(routeDatapackPath('data/minecraft/worldgen/biome/Bad Name.json')).toBeUndefined();
    });

    it('ignores pre-1.21 plural directories, unconsumed registries and nested built-in packs', () => {
        expect(routeDatapackPath('data/minecraft/loot_tables/blocks/stone.json')).toBeUndefined();
        expect(routeDatapackPath('data/minecraft/trim_material/quartz.json')).toBeUndefined();
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

    it('checks a dimension type and a stem, and takes any worldgen root', () => {
        expect(
            structuralValidator({
                registry: 'dimensionTypes',
                path: 'p',
                data: { min_y: -64, height: 384, attributes: {} }
            })
        ).toEqual([]);
        expect(structuralValidator({ registry: 'dimensionTypes', path: 'p', data: { height: 384 } })).toMatchObject([
            { severity: 'error', code: 'definition.missing-key', message: 'min_y must be a number' }
        ]);
        expect(
            structuralValidator({
                registry: 'dimensions',
                path: 'p',
                data: { type: 'minecraft:overworld', generator: { type: 'minecraft:debug' } }
            })
        ).toEqual([]);
        expect(structuralValidator({ registry: 'dimensions', path: 'p', data: { type: 'x' } })).toMatchObject([
            { severity: 'error', code: 'definition.missing-key' }
        ]);
        // A density function may be a bare constant, as vanilla's `zero.json` is.
        expect(structuralValidator({ registry: 'worldgen', path: 'p', data: 0 })).toEqual([]);
        expect(structuralValidator({ registry: 'worldgen', path: 'p', data: { dimensions: {} } })).toEqual([]);
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
