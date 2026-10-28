import { describe, expect, it } from 'vitest';

import { definitionOf } from '../content/ContentOptions';
import { buildServerContent } from '../content/ServerContent';
import { fixtureContentOptions, fixtureDefinitions } from '../content/testing';
import { Item } from '../item/Item';
import { lootLevelOf } from '../world/lootLevel';
import { Block } from './Block';
import { blockLootTableOf, rollBlockDrops } from './blockLoot';

describe('block', () => {
    describe('loot', () => {
        it('finds the Java table that drops a Bedrock block', () => {
            const content = buildServerContent(fixtureContentOptions());

            expect(blockLootTableOf(content, 'minecraft:stone')).toBe('minecraft:blocks/stone');
        });

        it('has no table for a block the stack registered none for', () => {
            const content = buildServerContent(fixtureContentOptions());

            expect(blockLootTableOf(content, 'minecraft:redstone_lamp')).toBeUndefined();
        });

        it('rolls what the table says rather than the block itself', () => {
            const content = buildServerContent(fixtureContentOptions());

            // The fixture's `minecraft:blocks/stone` drops cobblestone, which
            // is the whole point: the drop is data, not the block.
            expect(rollBlockDrops(content, { identifier: 'minecraft:stone', states: {} })).toEqual([
                { identifier: 'minecraft:cobblestone', count: 1 }
            ]);
        });

        it('drops nothing for a block with no table', () => {
            const content = buildServerContent(fixtureContentOptions());

            expect(rollBlockDrops(content, { identifier: 'minecraft:redstone_lamp', states: {} })).toEqual([]);
        });

        /**
         * A stack holding nothing but the two Java 26.3 tables this suite
         * rolls, copied field for field out of the vanilla datapack. Both
         * branch on `block_state`, which is the only way a Bedrock block that
         * Java states rather than names can drop the right number.
         */
        const statefulTables = () =>
            buildServerContent(
                fixtureContentOptions({
                    load: () => ({
                        definitions: {
                            ...fixtureDefinitions(),
                            lootTablesJava: new Map([
                                [
                                    'minecraft:blocks/black_concrete_slab',
                                    definitionOf('lootTablesJava', 'minecraft:blocks/black_concrete_slab', {
                                        type: 'minecraft:block',
                                        pools: [
                                            {
                                                rolls: 1,
                                                entries: [
                                                    {
                                                        type: 'minecraft:item',
                                                        name: 'minecraft:black_concrete_slab',
                                                        modifier: [
                                                            {
                                                                type: 'minecraft:set_count',
                                                                condition: {
                                                                    type: 'minecraft:match_block',
                                                                    blocks: 'minecraft:black_concrete_slab',
                                                                    state: { type: 'double' }
                                                                },
                                                                count: 2
                                                            },
                                                            { type: 'minecraft:explosion_decay' }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ],
                                        random_sequence: 'minecraft:blocks/black_concrete_slab'
                                    })
                                ],
                                [
                                    'minecraft:blocks/shelf_mushroom',
                                    definitionOf('lootTablesJava', 'minecraft:blocks/shelf_mushroom', {
                                        type: 'minecraft:block',
                                        pools: [
                                            {
                                                rolls: 1,
                                                entries: [
                                                    {
                                                        type: 'minecraft:item',
                                                        name: 'minecraft:shelf_mushroom',
                                                        modifier: [
                                                            {
                                                                type: 'minecraft:set_count',
                                                                condition: {
                                                                    type: 'minecraft:match_block',
                                                                    blocks: 'minecraft:shelf_mushroom',
                                                                    state: { age: '1' }
                                                                },
                                                                count: 2
                                                            },
                                                            { type: 'minecraft:explosion_decay' }
                                                        ]
                                                    }
                                                ]
                                            }
                                        ],
                                        random_sequence: 'minecraft:blocks/shelf_mushroom'
                                    })
                                ]
                            ])
                        },
                        diagnostics: []
                    })
                })
            );

        describe('a Bedrock block Java states rather than names', () => {
            it('reaches the parent block table of an identifier Bedrock split off', () => {
                const content = statefulTables();

                expect(blockLootTableOf(content, 'minecraft:black_concrete_double_slab')).toBe(
                    'minecraft:blocks/black_concrete_slab'
                );
            });

            it('yields two slabs for the double slab and one for the half, as the Java table says', () => {
                const content = statefulTables();

                expect(
                    rollBlockDrops(content, {
                        identifier: 'minecraft:black_concrete_double_slab',
                        states: { 'minecraft:vertical_half': 'bottom' }
                    })
                ).toEqual([{ identifier: 'minecraft:black_concrete_slab', count: 2 }]);
                expect(
                    rollBlockDrops(content, {
                        identifier: 'minecraft:black_concrete_slab',
                        states: { 'minecraft:vertical_half': 'bottom' }
                    })
                ).toEqual([{ identifier: 'minecraft:black_concrete_slab', count: 1 }]);
            });

            it('yields two shelf mushrooms at the grown stage and one before it', () => {
                const content = statefulTables();

                expect(
                    rollBlockDrops(content, {
                        identifier: 'minecraft:shelf_mushroom',
                        states: { growth: 1, 'minecraft:cardinal_direction': 'north' }
                    })
                ).toEqual([{ identifier: 'minecraft:shelf_mushroom', count: 2 }]);
                expect(
                    rollBlockDrops(content, {
                        identifier: 'minecraft:shelf_mushroom',
                        states: { growth: 0, 'minecraft:cardinal_direction': 'north' }
                    })
                ).toEqual([{ identifier: 'minecraft:shelf_mushroom', count: 1 }]);
            });
        });

        it('is what a block breaking yields', () => {
            const content = buildServerContent(fixtureContentOptions());
            const stone = new Block({ name: 'minecraft:stone', content });
            const pickaxe = new Item({ name: 'minecraft:diamond_pickaxe', content });

            const drops = stone.getDrops(pickaxe);

            expect(drops.map((drop) => drop?.getName())).toEqual(['minecraft:cobblestone']);
        });

        /**
         * A table whose pool only runs in one dimension, which is the
         * shortest condition that cannot be answered without a level view.
         */
        const dimensionKeyed = () =>
            buildServerContent(
                fixtureContentOptions({
                    load: () => ({
                        definitions: {
                            ...fixtureDefinitions(),
                            lootTablesJava: new Map([
                                [
                                    'minecraft:blocks/stone',
                                    definitionOf('lootTablesJava', 'minecraft:blocks/stone', {
                                        type: 'minecraft:block',
                                        pools: [
                                            {
                                                rolls: 1,
                                                condition: {
                                                    type: 'minecraft:location_check',
                                                    predicate: { dimension: 'minecraft:overworld' }
                                                },
                                                entries: [{ type: 'minecraft:item', name: 'minecraft:cobblestone' }]
                                            }
                                        ]
                                    })
                                ]
                            ])
                        },
                        diagnostics: []
                    })
                })
            );

        it('evaluates the conditions that ask about the world', () => {
            const content = dimensionKeyed();
            const level = lootLevelOf({ getTicks: () => 0, getDimension: () => ({ name: 'minecraft:overworld' }) });

            expect(rollBlockDrops(content, { identifier: 'minecraft:stone', states: {} }, { level })).toEqual([
                { identifier: 'minecraft:cobblestone', count: 1 }
            ]);
        });

        it('takes the level from the server the break happened on', () => {
            // Without the world the condition cannot be reached at all, so a
            // break in the nether proves the view arrived rather than that
            // nothing read it.
            const content = dimensionKeyed();
            const pickaxe = new Item({ name: 'minecraft:diamond_pickaxe', content });
            const stone = new Block({ name: 'minecraft:stone', content });
            const serverIn = (dimension: string) => ({
                getWorldManager: () => ({
                    getDefaultWorld: () => ({ getTicks: () => 0, getDimension: () => ({ name: dimension }) })
                })
            });

            expect(stone.getDrops(pickaxe, serverIn('minecraft:overworld')).map((drop) => drop?.getName())).toEqual([
                'minecraft:cobblestone'
            ]);
            expect(stone.getDrops(pickaxe, serverIn('minecraft:the_nether'))).toEqual([]);
        });

        /**
         * The shulker box rule, on the fixture's one registered block: an entry whose
         * `copy_components` lifts what the block was holding onto what it drops.
         */
        const copyingTable = () =>
            buildServerContent(
                fixtureContentOptions({
                    load: () => ({
                        definitions: {
                            ...fixtureDefinitions(),
                            lootTablesJava: new Map([
                                [
                                    'minecraft:blocks/stone',
                                    definitionOf('lootTablesJava', 'minecraft:blocks/stone', {
                                        type: 'minecraft:block',
                                        pools: [
                                            {
                                                rolls: 1,
                                                entries: [
                                                    {
                                                        type: 'minecraft:item',
                                                        name: 'minecraft:cobblestone',
                                                        modifier: {
                                                            type: 'minecraft:copy_components',
                                                            source: 'block_entity',
                                                            include: ['minecraft:container']
                                                        }
                                                    }
                                                ]
                                            }
                                        ]
                                    })
                                ]
                            ])
                        },
                        diagnostics: []
                    })
                })
            );

        it('copies what the block was holding onto what it drops', () => {
            const held = {
                identifier: 'minecraft:diamond_pickaxe',
                count: 1,
                enchantments: { 'minecraft:fortune': 3 }
            };

            const drops = rollBlockDrops(
                copyingTable(),
                { identifier: 'minecraft:stone', states: {} },
                { blockEntity: { items: [undefined, held] } }
            );

            // The slot survives too, so a box put back down puts each stack where it was.
            expect(drops).toEqual([{ identifier: 'minecraft:cobblestone', count: 1, contents: [undefined, held] }]);
        });

        it('leaves the contents off a drop whose block was holding nothing', () => {
            const drops = rollBlockDrops(
                copyingTable(),
                { identifier: 'minecraft:stone', states: {} },
                { blockEntity: { items: [undefined, undefined] } }
            );

            expect(drops).toEqual([{ identifier: 'minecraft:cobblestone', count: 1 }]);
        });

        /** A stone table carrying one of the two rules a blast reaches. */
        const explosionTable = (rule: 'survives_explosion' | 'explosion_decay') =>
            buildServerContent(
                fixtureContentOptions({
                    load: () => ({
                        definitions: {
                            ...fixtureDefinitions(),
                            lootTablesJava: new Map([
                                [
                                    'minecraft:blocks/stone',
                                    definitionOf('lootTablesJava', 'minecraft:blocks/stone', {
                                        type: 'minecraft:block',
                                        ...(rule === 'explosion_decay'
                                            ? { modifier: { type: 'minecraft:explosion_decay' } }
                                            : {}),
                                        pools: [
                                            {
                                                rolls: 1,
                                                entries: [
                                                    {
                                                        type: 'minecraft:item',
                                                        name: 'minecraft:cobblestone',
                                                        ...(rule === 'survives_explosion'
                                                            ? { condition: { type: 'minecraft:survives_explosion' } }
                                                            : {})
                                                    }
                                                ]
                                            }
                                        ]
                                    })
                                ]
                            ])
                        },
                        diagnostics: []
                    })
                })
            );

        /** A draw that always answers the same number, which is enough for a one-item stack. */
        const draws = (value: number) => ({ nextFloat: () => value, nextInt: () => 0 });

        describe('a block an explosion took out', () => {
            // Both of Java's explosion rules roll against 1 / radius, which for
            // TNT's radius of 4 keeps a quarter. `survives_explosion` is the
            // condition vanilla's stone table carries and `explosion_decay` the
            // modifier the crop tables carry; neither can be reached without the
            // `explosion_radius` parameter.
            it.each(['survives_explosion', 'explosion_decay'] as const)(
                'keeps the drop through %s when the draw is under one over the radius',
                (rule) => {
                    const drops = rollBlockDrops(
                        explosionTable(rule),
                        { identifier: 'minecraft:stone', states: {} },
                        { explosionRadius: 4, random: draws(0.2) }
                    );

                    expect(drops).toEqual([{ identifier: 'minecraft:cobblestone', count: 1 }]);
                }
            );

            it.each(['survives_explosion', 'explosion_decay'] as const)(
                'loses the drop through %s when the draw is over',
                (rule) => {
                    const drops = rollBlockDrops(
                        explosionTable(rule),
                        { identifier: 'minecraft:stone', states: {} },
                        { explosionRadius: 4, random: draws(0.3) }
                    );

                    expect(drops).toEqual([]);
                }
            );

            it.each(['survives_explosion', 'explosion_decay'] as const)(
                'keeps everything through %s for an ordinary break, which reports no radius',
                (rule) => {
                    const drops = rollBlockDrops(
                        explosionTable(rule),
                        { identifier: 'minecraft:stone', states: {} },
                        { random: draws(0.99) }
                    );

                    expect(drops).toEqual([{ identifier: 'minecraft:cobblestone', count: 1 }]);
                }
            );
        });
    });
});
