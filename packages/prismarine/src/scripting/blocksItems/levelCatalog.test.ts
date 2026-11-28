import { BlockPalette, BlockStateModel } from '@jsprismarine/blocks';
import { describe, expect, it } from 'vitest';

import { definitionOf, definitionsOf } from '../../content/ContentOptions';
import { buildServerContent } from '../../content/ServerContent';
import { fixtureBlockPalette, fixtureContentOptions, fixtureDefinitions } from '../../content/testing';
import { levelCatalog, packBlockFacts } from './levelCatalog';

/** A light block in the shape light addons write: no collision, and it takes a water source's place. */
const LIGHT = {
    format_version: '1.26.0',
    'minecraft:block': {
        description: { identifier: 'jsp:light' },
        components: {
            'minecraft:collision_box': false,
            'minecraft:liquid_detection': {
                detection_rules: [{ liquid_type: 'water', can_contain_liquid: true, on_liquid_touches: 'no_reaction' }]
            }
        }
    }
};

/** A block that declares nothing about water or collision. */
const PLAIN = {
    format_version: '1.26.0',
    'minecraft:block': { description: { identifier: 'jsp:plain' }, components: {} }
};

const content = buildServerContent(
    fixtureContentOptions({
        load: () => ({
            definitions: definitionsOf({
                ...fixtureDefinitions(),
                blocks: new Map([
                    ...fixtureDefinitions().blocks,
                    ['jsp:light', definitionOf('blocks', 'jsp:light', LIGHT)],
                    ['jsp:plain', definitionOf('blocks', 'jsp:plain', PLAIN)]
                ])
            }),
            diagnostics: []
        }),
        blockPalette: new BlockPalette([
            ...fixtureBlockPalette().entries.map((entry) => [entry.identifier, entry.model] as const),
            ['jsp:light', new BlockStateModel([])],
            ['jsp:plain', new BlockStateModel([])]
        ])
    })
);

const catalog = levelCatalog({
    blockTypes: () => ['minecraft:stone', 'jsp:custom_block'],
    itemTypes: () => ['minecraft:apple', 'jsp:custom_item']
});

describe('levelCatalog', () => {
    it("joins a vanilla block's permutation answers with what a placed block of it answers", () => {
        const stone = catalog.blockType('minecraft:stone');
        expect(stone?.localizationKey).toBe('tile.stone.stone.name');
        expect(stone?.solid).toBe(true);
        expect(stone?.components).toContain('minecraft:movable');
        expect(catalog.blockType('minecraft:oak_fence')?.solid).toBe(false);
        expect(catalog.blockType('minecraft:water')?.liquid).toBe(true);
    });

    it("lists the content's own types after the vanilla ones, and describes them", () => {
        const blocks = catalog.blockTypes();
        expect(blocks.indexOf('jsp:custom_block')).toBe(blocks.length - 1);
        expect(blocks.filter((id) => id === 'minecraft:stone')).toHaveLength(1);
        expect(catalog.blockType('jsp:custom_block')?.item).toBe('jsp:custom_block');
        expect(catalog.itemType('jsp:custom_item')?.maxAmount).toBe(64);
        expect(catalog.blockType('jsp:no_such_block')).toBeUndefined();
    });

    it("answers a pack block's water rule and collision from its definition", () => {
        const packCatalog = levelCatalog({
            blockTypes: () => ['jsp:light', 'jsp:plain'],
            itemTypes: () => [],
            blockFacts: (typeId) => packBlockFacts(content, typeId)
        });

        // A script waterlogs the light, which BDS allows for a block that can contain water.
        expect(packCatalog.blockType('jsp:light')).toMatchObject({
            water: { contain: true, blocking: false, destroyed: false, spawns: false },
            solid: false
        });
        expect(packCatalog.blockType('jsp:plain')).toMatchObject({
            water: { contain: false, blocking: true },
            solid: true
        });
    });

    it('finds the item and data value of a potion, and reads a data value back to its potion', () => {
        const splash = catalog.potionItem('minecraft:swiftness', 'ThrownSplash');
        expect(splash?.typeId).toBe('minecraft:splash_potion');
        expect(splash === undefined ? undefined : catalog.potionOf(splash.typeId, splash.data)).toEqual({
            effect: 'minecraft:swiftness',
            delivery: 'ThrownSplash'
        });
        expect(catalog.potionOf('minecraft:potion', 0)).toEqual({ effect: 'minecraft:water', delivery: 'Consume' });
        expect(catalog.potionItem('minecraft:jsp', 'Consume')).toBeUndefined();
    });

    it('gives each enchantment the items it goes on and the ones it refuses', () => {
        const sharpness = catalog.enchantments().find((each) => each.id === 'sharpness');
        expect(sharpness?.maxLevel).toBe(5);
        expect(sharpness?.items).toContain('minecraft:diamond_sword');
        expect(sharpness?.conflicts).toContain('smite');
    });
});
