import { describe, expect, it } from 'vitest';

import { definitionOf } from '../content/ContentOptions';
import { parseBlockTransformers, resolveTransform } from './blockTransformers';
import type { TransformBlockAt, TransformTarget } from './blockTransformers';

/** The hoe file's shape, cut to the farmland rule: a tag on the block and air above it. */
const HOE = [
    {
        block_state_provider: {
            type: 'minecraft:rule_based',
            rules: [
                {
                    if_true: {
                        type: 'minecraft:all_of',
                        predicates: [
                            { type: 'minecraft:matching_block_tag', tag: 'minecraft:turns_into_farmland' },
                            { type: 'minecraft:matching_block_tag', offset: [0, 1, 0], tag: 'minecraft:air' }
                        ]
                    },
                    then: { id: 'minecraft:farmland', properties: { moisture: '0' } }
                },
                {
                    if_true: { type: 'minecraft:matching_blocks', blocks: 'minecraft:coarse_dirt' },
                    then: { id: 'minecraft:dirt' }
                }
            ]
        },
        disallowed_faces: ['down'],
        item_damage_per_use: 1,
        sound: 'minecraft:item.hoe.till'
    }
];

/** The axe's stripping shape: `copy_properties` carries the log's axis onto the stripped one. */
const AXE = [
    {
        block_state_provider: {
            type: 'minecraft:rule_based',
            rules: [
                {
                    if_true: { type: 'minecraft:matching_blocks', blocks: 'minecraft:oak_log' },
                    then: {
                        type: 'minecraft:copy_properties',
                        source: { id: 'minecraft:stripped_oak_log', properties: { axis: 'y' } }
                    }
                }
            ]
        },
        item_damage_per_use: 1,
        sound: 'minecraft:item.axe.strip'
    }
];

const registry = parseBlockTransformers(
    new Map([
        ['minecraft:hoe', definitionOf('blockTransformers', 'minecraft:hoe', HOE)],
        ['minecraft:axe', definitionOf('blockTransformers', 'minecraft:axe', AXE)]
    ])
);

/** The Java block tags the rules name, over the handful of blocks these tests stand up. */
const TAGS = new Map([
    ['minecraft:turns_into_farmland', new Set(['minecraft:grass_block', 'minecraft:dirt'])],
    ['minecraft:air', new Set(['minecraft:air'])]
]);

const contextWith = (above: string): { tags: { includes: typeof includes }; blockAt: TransformBlockAt } => ({
    tags: { includes },
    blockAt: (at) => (at.y === 5 ? { identifier: above, states: {} } : undefined)
});

const includes = (registryName: string, tag: string, identifier: string): boolean =>
    registryName === 'block' && (TAGS.get(tag)?.has(identifier) ?? false);

const GRASS: TransformTarget = { identifier: 'minecraft:grass_block', states: {}, position: { x: 0, y: 4, z: 0 } };

describe('resolveTransform', () => {
    it('tills grass with air above it into dry farmland', () => {
        const placement = resolveTransform(registry, contextWith('minecraft:air'), 'minecraft:hoe', GRASS, 'up');

        expect(placement).toEqual({ identifier: 'minecraft:farmland', states: { moisturized_amount: 0 } });
    });

    it('declines under a roof, which is the air-above predicate with its offset', () => {
        expect(
            resolveTransform(registry, contextWith('minecraft:stone'), 'minecraft:hoe', GRASS, 'up')
        ).toBeUndefined();
    });

    it('declines the underside, which is the entry refusing the down face', () => {
        expect(
            resolveTransform(registry, contextWith('minecraft:air'), 'minecraft:hoe', GRASS, 'down')
        ).toBeUndefined();
    });

    it('declines a block no rule names, and a transformer no pack declares', () => {
        const sand: TransformTarget = { ...GRASS, identifier: 'minecraft:sand' };
        expect(resolveTransform(registry, contextWith('minecraft:air'), 'minecraft:hoe', sand, 'up')).toBeUndefined();
        expect(
            resolveTransform(registry, contextWith('minecraft:air'), 'minecraft:brush', GRASS, 'up')
        ).toBeUndefined();
    });

    it('strips a log onto its own axis through copy_properties', () => {
        const log: TransformTarget = {
            identifier: 'minecraft:oak_log',
            states: { pillar_axis: 'x' },
            position: { x: 0, y: 4, z: 0 }
        };

        const placement = resolveTransform(registry, contextWith('minecraft:air'), 'minecraft:axe', log, 'up');

        expect(placement).toEqual({ identifier: 'minecraft:stripped_oak_log', states: { pillar_axis: 'x' } });
    });
});
