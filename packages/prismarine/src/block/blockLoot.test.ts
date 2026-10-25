import { describe, expect, it } from 'vitest';

import { buildServerContent } from '../content/ServerContent';
import { fixtureContentOptions } from '../content/testing';
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
    });
});
