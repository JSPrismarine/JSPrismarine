import { deserialize, serialize } from 'node:v8';

import { PackLoadError } from '@jsprismarine/packs';
import type { Definitions } from '@jsprismarine/packs';
import { reportProgress } from '../../../../.test/reportProgress';
import { describe, expect, it } from 'vitest';

import { buildServerContent, rebindServerContentSeed } from './ServerContent';
import { definitionOf, definitionsOf, emptyDefinitions } from './ContentOptions';
import { FIXTURE_BLOCKS, fixtureBlockPalette, fixtureContentOptions, fixtureDefinitions } from './testing';

describe('buildServerContent', () => {
    it('populates every registry from one pack stack', () => {
        const content = buildServerContent(fixtureContentOptions());

        expect([...content.blocks.types.keys()].sort()).toEqual([...FIXTURE_BLOCKS].sort());
        expect(content.items.registry.size).toBe(3);
        expect(content.entities.registry.keys()).toContain('minecraft:cow');
        expect(content.recipes.recipes.map((recipe) => recipe.id)).toEqual(['minecraft:torch']);
        expect(content.loot.ids).toEqual(['minecraft:blocks/stone']);
        expect(content.advancements.get('minecraft:story/root')).toBeDefined();
        expect(content.enchantments.ids).toEqual(['minecraft:fortune']);
        expect(content.spawnRules.map((rule) => rule.identifier)).toEqual(['minecraft:cow']);
        expect([...content.tradeTables.keys()]).toEqual(['trading/economy_trades/farmer_trades.json']);
        expect(content.biomes.keys()).toEqual(['minecraft:plains']);
        expect(content.features.keys()).toEqual(['minecraft:single_stone_feature']);
        expect(content.tags.members('block', 'minecraft:mineable/pickaxe')).toEqual([...FIXTURE_BLOCKS]);
        expect(content.items.tags.includes('minecraft:boats', 'minecraft:oak_boat')).toBe(true);
        expect(content.items.types.get('minecraft:diamond_pickaxe')?.hasTag('minecraft:is_pickaxe')).toBe(true);
    });

    describe('Bedrock behavior pack recipes', () => {
        /** The fixture content with Bedrock recipe files, by identifier, in the loaded `recipes` registry. */
        const withBedrockRecipes = (recipes: Record<string, unknown>) => {
            const definitions = fixtureDefinitions();
            const loaded = new Map(
                Object.entries(recipes).map(([id, file]) => [id, definitionOf('recipes', id, file)])
            );
            return buildServerContent(
                fixtureContentOptions({
                    load: () => ({ definitions: { ...definitions, recipes: loaded }, diagnostics: [] })
                })
            );
        };

        // Issue #3835: the server built its recipe book from the Java datapacks alone.
        it("adds a pack's recipe to the book beside the datapack's, and crafts it", () => {
            const content = withBedrockRecipes({
                'test:dirt_to_cobblestone': {
                    format_version: '1.20.10',
                    'minecraft:recipe_shapeless': {
                        description: { identifier: 'test:dirt_to_cobblestone' },
                        tags: ['crafting_table'],
                        ingredients: [{ item: 'minecraft:dirt' }],
                        result: { item: 'minecraft:cobblestone' }
                    }
                }
            });

            expect(content.recipes.recipes.map((recipe) => recipe.id).sort()).toEqual([
                'minecraft:torch',
                'test:dirt_to_cobblestone'
            ]);
            const crafted = content.recipes.match({
                station: 'crafting',
                grid: { width: 2, height: 2, slots: [{ id: 'minecraft:dirt', count: 1 }, null, null, null] }
            });
            expect(crafted?.recipe.id).toBe('test:dirt_to_cobblestone');
            expect(crafted?.result).toMatchObject({ id: 'minecraft:cobblestone', count: 1 });
        });

        it('replaces the Java recipe of the same identifier', () => {
            const content = withBedrockRecipes({
                'minecraft:torch': {
                    format_version: '1.20.10',
                    'minecraft:recipe_shapeless': {
                        description: { identifier: 'minecraft:torch' },
                        tags: ['crafting_table'],
                        ingredients: ['minecraft:dirt'],
                        result: { item: 'minecraft:torch', count: 8 }
                    }
                }
            });

            const torch = content.recipes.get('minecraft:torch');
            expect(torch?.type === 'minecraft:crafting_shapeless' && torch.ingredients[0]?.items).toEqual([
                'minecraft:dirt'
            ]);
        });

        it('reports a recipe it cannot load against its pack file', () => {
            const content = withBedrockRecipes({
                'test:lab': {
                    format_version: '1.20.10',
                    'minecraft:recipe_shaped_chemistry': {
                        description: { identifier: 'test:lab' },
                        tags: ['lab_table'],
                        pattern: ['#'],
                        key: { '#': 'minecraft:dirt' },
                        result: 'minecraft:cobblestone'
                    }
                }
            });

            expect(content.recipes.get('test:lab')).toBeUndefined();
            expect(content.diagnostics).toContainEqual(
                expect.objectContaining({ code: 'recipe.unsupported', path: 'recipes/test:lab.json' })
            );
        });

        // Issue #3838: a pack's brewing recipes loaded as nothing.
        it("brews a pack's brewing mix", () => {
            const content = withBedrockRecipes({
                'test:awkward_from_dirt': {
                    format_version: '1.20.10',
                    'minecraft:recipe_brewing_mix': {
                        description: { identifier: 'test:awkward_from_dirt' },
                        tags: ['brewing_stand'],
                        input: 'minecraft:potion_type:water',
                        reagent: 'minecraft:dirt',
                        output: 'minecraft:potion_type:awkward'
                    }
                }
            });

            const brewed = content.recipes.match({
                station: 'brewing',
                input: {
                    id: 'minecraft:splash_potion',
                    count: 1,
                    components: { 'minecraft:potion_contents': { potion: 'minecraft:water' } }
                },
                reagent: { id: 'minecraft:dirt', count: 1 }
            });
            expect(brewed?.recipe.id).toBe('test:awkward_from_dirt_splash_potion');
            expect(brewed?.result).toMatchObject({
                id: 'minecraft:splash_potion',
                components: { 'minecraft:potion_contents': { potion: 'minecraft:awkward' } }
            });
        });

        it("keeps a pack's material reduction when the registry has its items, and reports it otherwise", () => {
            const reduction = (input: string, output: string) => ({
                format_version: '1.14',
                'minecraft:recipe_material_reduction': {
                    description: { identifier: `test:${input.replace(/^.*:/, '')}` },
                    tags: 'material_reducer',
                    input,
                    output: [{ item: output, count: 2 }]
                }
            });
            const content = withBedrockRecipes({
                'test:stone': reduction('minecraft:stone', 'minecraft:redstone_lamp'),
                'test:andesite_slab': reduction('minecraft:andesite_slab', 'minecraft:element_14')
            });

            expect(content.materialReductions.map(({ id, input, outputs }) => ({ id, input, outputs }))).toEqual([
                {
                    id: 'test:stone',
                    input: { identifier: 'minecraft:stone', data: 0 },
                    outputs: [{ identifier: 'minecraft:redstone_lamp', count: 2 }]
                }
            ]);
            expect(content.diagnostics).toContainEqual(
                expect.objectContaining({ code: 'recipe.invalid', path: 'recipes/test:andesite_slab.json' })
            );
        });
    });

    it('fingerprints the effective definitions and content tables', () => {
        const original = fixtureDefinitions();
        const biomes = new Map(original.biomes);
        biomes.set('minecraft:plains', definitionOf('biomes', 'minecraft:plains', { changed: true }));

        const changed = buildServerContent(
            fixtureContentOptions({ load: () => ({ definitions: { ...original, biomes }, diagnostics: [] }) })
        );
        const repeated = buildServerContent(fixtureContentOptions());

        expect(repeated.contentFingerprint).toMatch(/^[0-9a-f]{64}$/);
        expect(repeated.contentFingerprint).toBe(buildServerContent(fixtureContentOptions()).contentFingerprint);
        expect(changed.contentFingerprint).not.toBe(repeated.contentFingerprint);
    });

    it('rebuilds production registries from snapshot data and binds loot to the restored seed', () => {
        const sourceDefinitions = fixtureDefinitions();
        const lootTablesJava = new Map(sourceDefinitions.lootTablesJava);
        lootTablesJava.set(
            'snapshot:seeded',
            definitionOf(
                'lootTablesJava',
                'snapshot:seeded',
                {
                    type: 'minecraft:chest',
                    random_sequence: 'snapshot:seeded',
                    pools: [
                        {
                            rolls: 1,
                            entries: [
                                { type: 'minecraft:item', name: 'minecraft:stone', weight: 1 },
                                { type: 'minecraft:item', name: 'minecraft:redstone_lamp', weight: 1 }
                            ]
                        }
                    ]
                },
                'snapshot-fixture'
            )
        );
        const definitions = { ...sourceDefinitions, lootTablesJava };
        const snapshotBuild = buildServerContent(
            fixtureContentOptions({ seed: 0n, load: () => ({ definitions, diagnostics: [] }) })
        );
        // The startup snapshot keeps plain pack data; resolving it again reconstructs world closures and loot streams.
        const restoredDefinitions: Definitions = deserialize(serialize(snapshotBuild.definitions));
        const lootStreams: string[] = [];

        for (const seed of [1n, 42n]) {
            const restored = buildServerContent(
                fixtureContentOptions({ seed, load: () => ({ definitions: restoredDefinitions, diagnostics: [] }) })
            );
            const fresh = buildServerContent(
                fixtureContentOptions({ seed, load: () => ({ definitions, diagnostics: [] }) })
            );

            expect(restored).not.toBe(snapshotBuild);
            expect(restored.world).not.toBe(snapshotBuild.world);
            expect(restored.blocks.types).not.toBe(snapshotBuild.blocks.types);
            expect(restored.loot).not.toBe(snapshotBuild.loot);
            expect(restored.equipmentLoot).not.toBe(snapshotBuild.equipmentLoot);
            expect(restored.contentFingerprint).toBe(fresh.contentFingerprint);
            expect([...restored.blocks.types.keys()]).toEqual([...fresh.blocks.types.keys()]);
            expect([...restored.items.registry.keys()]).toEqual([...fresh.items.registry.keys()]);
            expect([...restored.entities.registry.keys()]).toEqual([...fresh.entities.registry.keys()]);
            expect(restored.recipes.recipes.map((recipe) => recipe.id)).toEqual(
                fresh.recipes.recipes.map((recipe) => recipe.id)
            );
            expect(restored.loot.ids).toEqual(fresh.loot.ids);
            expect(restored.loot.worldSeed).toBe(seed);
            expect(restored.equipmentLoot.worldSeed).toBe(seed);
            expect(restored.loot.roll('snapshot:seeded').map(({ id, count }) => [id, count])).toEqual(
                fresh.loot.roll('snapshot:seeded').map(({ id, count }) => [id, count])
            );
            const state = restored.loot.saveRandomState();
            expect(state.worldSeed).toBe(seed.toString());
            expect(state).toEqual(fresh.loot.saveRandomState());
            lootStreams.push(JSON.stringify(state.streams));
        }

        expect(lootStreams[0]).not.toBe(lootStreams[1]);
    });

    it('reuses seed-independent registries while rebuilding seed-bound loot streams', () => {
        const definitions = fixtureDefinitions();
        const lootTablesJava = new Map(definitions.lootTablesJava);
        lootTablesJava.set(
            'snapshot:seeded',
            definitionOf(
                'lootTablesJava',
                'snapshot:seeded',
                {
                    type: 'minecraft:chest',
                    random_sequence: 'snapshot:seeded',
                    pools: [
                        {
                            rolls: 1,
                            entries: [
                                { type: 'minecraft:item', name: 'minecraft:stone', weight: 1 },
                                { type: 'minecraft:item', name: 'minecraft:redstone_lamp', weight: 1 }
                            ]
                        }
                    ]
                },
                'snapshot-fixture'
            )
        );
        const snapshot = buildServerContent(
            fixtureContentOptions({
                load: () => ({ definitions: { ...definitions, lootTablesJava }, diagnostics: [] })
            })
        );

        for (const seed of [1n, 42n]) {
            const restored = rebindServerContentSeed(snapshot, seed);
            const fresh = buildServerContent(
                fixtureContentOptions({
                    seed,
                    load: () => ({ definitions: { ...definitions, lootTablesJava }, diagnostics: [] })
                })
            );

            expect(restored.blocks).toBe(snapshot.blocks);
            expect(restored.items).toBe(snapshot.items);
            expect(restored.entities).toBe(snapshot.entities);
            expect(restored.recipes).toBe(snapshot.recipes);
            expect(restored.loot).not.toBe(snapshot.loot);
            expect(restored.equipmentLoot).not.toBe(snapshot.equipmentLoot);
            expect(restored.loot.worldSeed).toBe(seed);
            expect(restored.equipmentLoot.worldSeed).toBe(seed);
            expect(restored.loot.saveRandomState()).toEqual(fresh.loot.saveRandomState());
            expect(restored.loot.roll('snapshot:seeded').map(({ id, count }) => [id, count])).toEqual(
                fresh.loot.roll('snapshot:seeded').map(({ id, count }) => [id, count])
            );
        }
    });

    it('loads Bedrock item tags and component bodies without replacing Java defaults', () => {
        const definitions = fixtureDefinitions();
        const gem = definitionOf('items', 'test:gem', {
            format_version: '1.26.30',
            'minecraft:item': {
                description: { identifier: 'test:gem' },
                components: {
                    'minecraft:icon': { texture: 'gem' },
                    'minecraft:tags': ['test:gems']
                }
            }
        });
        const items = new Map(definitions.items);
        items.set(gem.identifier, gem);

        const content = buildServerContent(
            fixtureContentOptions({ load: () => ({ definitions: { ...definitions, items }, diagnostics: [] }) })
        );
        const type = content.items.types.get('test:gem')!;

        expect(type.bedrockComponents.get('minecraft:icon')).toEqual({ texture: 'gem' });
        expect(type.hasTag('test:gems')).toBe(true);
        expect(content.items.tags.includes('test:gems', 'test:gem')).toBe(true);
        expect(content.items.types.get('minecraft:diamond_pickaxe')?.hasTag('minecraft:is_pickaxe')).toBe(true);
    });

    /**
     * Both halves of the enchantment registry's wiring. The item tags decide
     * whether an enchantment supports a stack at all, and the enchantment tags
     * decide what the enchanting table may draw. The build used to pass the
     * item tags in the enchantment tags' place and nothing in the item tags'
     * place, which left `supports` false for every enchantment and the table's
     * pool empty.
     */
    describe('the enchantment registry', () => {
        it('supports a stack through the item tag its supported_items names', () => {
            const content = buildServerContent(fixtureContentOptions());
            const pickaxe = { id: 'minecraft:diamond_pickaxe', count: 1, components: new Map() };

            expect(content.enchantments.supports(pickaxe, 'minecraft:fortune')).toBe(true);
            expect(content.enchantments.applicableTo(pickaxe)).toEqual(['minecraft:fortune']);
        });

        it('refuses a stack the tag does not name', () => {
            const content = buildServerContent(fixtureContentOptions());
            const torch = { id: 'minecraft:torch', count: 1, components: new Map() };

            expect(content.enchantments.supports(torch, 'minecraft:fortune')).toBe(false);
        });

        it('expands the enchantment tags the table and the loot rules read', () => {
            const content = buildServerContent(fixtureContentOptions());

            expect([...content.enchantments.membersOf('minecraft:in_enchanting_table')]).toEqual(['minecraft:fortune']);
            expect(content.enchantments.hasTag('minecraft:fortune', 'minecraft:in_enchanting_table')).toBe(true);
        });
    });

    it('leaves the registries nothing sources empty rather than absent', () => {
        const content = buildServerContent(
            fixtureContentOptions({ load: () => ({ definitions: emptyDefinitions(), diagnostics: [] }) })
        );

        expect(content.structures.size).toBe(0);
        expect(content.featureRules.size).toBe(0);
        expect(content.tags.registries).toEqual([]);
    });

    it('attaches the vanilla block behavior families to the blocks they cover', () => {
        const content = buildServerContent(fixtureContentOptions());
        const behaviorNames = [...content.blocks.behaviors.names()].sort();

        reportProgress(
            `Block behavior implementation progress: ${behaviorNames.length} registered (${behaviorNames.join(', ')})`
        );
        expect(
            content.blocks.types
                .get('minecraft:redstone_lamp')
                ?.state()
                .content.behaviors.map((bound) => bound.name)
        ).toEqual(['jsprismarine:redstone']);
        expect(
            content.blocks.types
                .get('minecraft:stone')
                ?.state()
                .content.behaviors.map((bound) => bound.name)
        ).toEqual(['jsprismarine:plain_block']);
    });

    it('attaches the vanilla item behavior families to the items they cover', () => {
        const content = buildServerContent(fixtureContentOptions());

        expect(content.items.behaviors.names().length).toBeGreaterThan(0);
        expect(
            content.items.registry.get('minecraft:diamond_pickaxe')?.behaviors.map((bound) => bound.name)
        ).not.toHaveLength(0);
    });

    it('registers entity goals and brain mobs for content consumers', () => {
        const content = buildServerContent(fixtureContentOptions());
        const brainMobIds = content.entities.brains.ids;

        reportProgress(
            `Brain mob implementation progress: ${brainMobIds.length} registered (${brainMobIds.join(', ')})`
        );
        expect(content.entities.components.has('minecraft:behavior.float')).toBe(true);
        expect(content.entities.brains.get('minecraft:allay')?.id).toBe('minecraft:allay');
    });

    it('flattens the hot block columns so a runtime id indexes them', () => {
        const content = buildServerContent(fixtureContentOptions());
        const palette = content.blocks.palette;

        expect(content.blocks.table.hardness.length).toBe(palette.stateCount);
        expect(content.blocks.table.hardness[palette.runtimeId('minecraft:stone')]).toBeCloseTo(1.5);
        expect(content.blocks.table.lightEmission[palette.runtimeId('minecraft:redstone_lamp', { lit: true })]).toBe(
            15
        );
        expect(content.blocks.table.friction[palette.runtimeId('minecraft:stone')]).toBeCloseTo(0.6);
    });

    it('flattens the hot item columns so a registry id indexes them', () => {
        const content = buildServerContent(fixtureContentOptions());
        const pickaxe = content.items.registry.idOf('minecraft:diamond_pickaxe')!;

        expect(content.items.facts.maxStackSize.length).toBe(content.items.registry.size);
        expect(content.items.facts.maxStackSize[pickaxe]).toBe(1);
        expect(content.items.facts.maxDamage[pickaxe]).toBe(1561);
    });

    it('fails on a bad pack in strict mode and loads short without it', () => {
        const broken = definitionsOf({
            blocks: new Map([['minecraft:stone', definitionOf('blocks', 'minecraft:stone', { nonsense: true })]])
        });
        const load = (_stack: unknown, options: { strict?: boolean }) => {
            const diagnostics = [
                { severity: 'error' as const, code: 'definition.invalid-json', pack: 'bad', message: 'unexpected {' }
            ];
            if (options.strict) throw new PackLoadError(diagnostics);
            return { definitions: broken, diagnostics };
        };

        expect(() =>
            buildServerContent({ load, strict: true, blockPalette: fixtureBlockPalette(), itemDefinitions: [] })
        ).toThrow(PackLoadError);

        const content = buildServerContent({ load, blockPalette: fixtureBlockPalette(), itemDefinitions: [] });
        expect(content.diagnostics.some((diagnostic) => diagnostic.code === 'definition.invalid-json')).toBe(true);
    });

    it('keeps the loaded definitions reachable for the subsystems still reading them directly', () => {
        const content = buildServerContent(fixtureContentOptions());

        expect(content.definitions.blocks.size).toBe(fixtureDefinitions().blocks.size);
    });
});
