/**
 * Drop identifiers against the real `@jsprismarine/mapping` tables, which is the point: a
 * stub lookup would pass whatever this file claimed the mapping was.
 */
import { describe, expect, it } from 'vitest';

import { bedrockItemDrops } from './bedrockDrops';

describe('a rolled drop under its Bedrock name', () => {
    it('leaves an item both editions spell the same way alone', () => {
        expect(bedrockItemDrops([{ identifier: 'minecraft:diamond', count: 3 }])).toEqual([
            { identifier: 'minecraft:diamond', count: 3 }
        ]);
    });

    it('renames the two reviewed losses a table can still roll', () => {
        const drops = bedrockItemDrops([
            { identifier: 'minecraft:spectral_arrow', count: 2 },
            { identifier: 'minecraft:furnace_minecart', count: 1 }
        ]);

        expect(drops.map((drop) => drop.identifier)).toEqual(['minecraft:arrow', 'minecraft:hopper_minecart']);
        expect(drops.map((drop) => drop.count)).toEqual([2, 1]);
    });

    it('resolves a legacy item variant from its auxiliary value', () => {
        expect(bedrockItemDrops([{ identifier: 'minecraft:wool', count: 2, meta: 14 }])).toEqual([
            { identifier: 'minecraft:red_wool', count: 2, meta: 0 }
        ]);
    });

    it('keeps everything a drop carries besides its name', () => {
        const [drop] = bedrockItemDrops([
            {
                identifier: 'minecraft:diamond_sword',
                count: 1,
                enchantments: { 'minecraft:sharpness': 3 },
                customName: 'Fang',
                lore: ['Out of a dungeon'],
                damage: 7
            }
        ]);

        expect(drop).toEqual({
            identifier: 'minecraft:diamond_sword',
            count: 1,
            enchantments: { 'minecraft:sharpness': 3 },
            customName: 'Fang',
            lore: ['Out of a dungeon'],
            damage: 7
        });
    });

    it('renames what a container item holds, in the slots it held them in', () => {
        const [box] = bedrockItemDrops([
            {
                identifier: 'minecraft:shulker_box',
                count: 1,
                contents: [{ identifier: 'minecraft:spectral_arrow', count: 16 }, undefined]
            }
        ]);

        expect(box?.contents).toEqual([{ identifier: 'minecraft:arrow', count: 16 }, undefined]);
    });

    it('passes a pack identifier through, which is what a non-minecraft namespace means', () => {
        expect(bedrockItemDrops([{ identifier: 'example:ruby', count: 1 }])[0]?.identifier).toBe('example:ruby');
    });

    it('leaves an id the pinned Java version does not have exactly as it stands', () => {
        // A Bedrock-only item, which a Bedrock pack's own table is free to name. The
        // translation drops it; a drop the server was asked for is kept instead.
        expect(bedrockItemDrops([{ identifier: 'minecraft:not_a_java_item', count: 1 }])).toEqual([
            { identifier: 'minecraft:not_a_java_item', count: 1 }
        ]);
    });
});
