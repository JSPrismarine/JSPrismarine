import { describe, expect, it } from 'vitest';

import { definitionOf } from '../content/ContentOptions';
import { buildServerContent } from '../content/ServerContent';
import { fixtureContentOptions, fixtureDefinitions } from '../content/testing';
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

        it('is what a block breaking yields', () => {
            const content = buildServerContent(fixtureContentOptions());
            const stone = new Block({ name: 'minecraft:stone', content });

            const drops = stone.getDrops(null);

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
            const stone = new Block({ name: 'minecraft:stone', content });
            const serverIn = (dimension: string) => ({
                getWorldManager: () => ({
                    getDefaultWorld: () => ({ getTicks: () => 0, getDimension: () => ({ name: dimension }) })
                })
            });

            expect(stone.getDrops(null, serverIn('minecraft:overworld')).map((drop) => drop?.getName())).toEqual([
                'minecraft:cobblestone'
            ]);
            expect(stone.getDrops(null, serverIn('minecraft:the_nether'))).toEqual([]);
        });
    });
});
