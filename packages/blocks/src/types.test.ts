import type { Definition } from '@jsprismarine/content';
import { BehaviorRegistry } from '@jsprismarine/content';
import { describe, expect, it } from 'vitest';

import { destructibleByMining, loot, tags } from './components';
import type { BlockHooks } from './hooks';
import { BlockPalette, BlockStateModel } from './state';
import { BlockLoadError, resolveBlocks } from './types';

const definition = (identifier: string, block: Record<string, unknown>): Definition => ({
    identifier,
    registry: 'blocks',
    pack: 'test',
    path: `blocks/${identifier.replace(/^[^:]*:/, '')}.block.json`,
    data: { format_version: '1.26.50', 'minecraft:block': { description: { identifier }, ...block } }
});

const shelfMushroom = () =>
    definition('minecraft:shelf_mushroom', {
        description: {
            identifier: 'minecraft:shelf_mushroom',
            states: { growth: [0, 1] }
        },
        components: { 'minecraft:loot': 'loot_tables/blocks/shelf_mushroom_growth_0.json' },
        permutations: [
            {
                condition: "query.block_state('growth') == 1",
                components: { 'minecraft:loot': 'loot_tables/blocks/shelf_mushroom_growth_1.json' }
            }
        ]
    });

const emptyPalette = new BlockPalette([]);

describe('resolving block definitions', () => {
    it('takes a block with no declared states from the captured palette', () => {
        const resolved = resolveBlocks([
            definition('minecraft:oak_stairs', { components: { 'minecraft:loot': 'a.json' } })
        ]);

        const stairs = resolved.types.get('minecraft:oak_stairs');
        expect(stairs?.model.names()).toEqual(['minecraft:corner', 'upside_down_bit', 'weirdo_direction']);
        expect(stairs?.states).toHaveLength(40);
        expect(resolved.palette.stateCount).toBe(40);
    });

    it('gives each state a dense runtime id the palette agrees with', () => {
        const resolved = resolveBlocks([shelfMushroom()], { statePalette: emptyPalette });

        expect(resolved.states.map((state) => state.runtimeId)).toEqual([0, 1]);
        expect(resolved.states[1]?.values).toEqual({ growth: 1 });
    });

    it('applies the matching permutation to the state that matches it', () => {
        const resolved = resolveBlocks([shelfMushroom()], { statePalette: emptyPalette });
        const type = resolved.types.get('minecraft:shelf_mushroom')!;

        expect(type.state({ growth: 0 }).content.params(loot)).toBe('loot_tables/blocks/shelf_mushroom_growth_0.json');
        expect(type.state({ growth: 1 }).content.params(loot)).toBe('loot_tables/blocks/shelf_mushroom_growth_1.json');
        expect(type.state({ growth: 1 }).permutations).toEqual([0]);
    });

    it('exposes Bedrock tags after the state permutations resolve', () => {
        const resolved = resolveBlocks(
            [
                definition('test:tagged', {
                    description: { identifier: 'test:tagged', states: { growth: [0, 1] } },
                    components: { 'minecraft:tags': ['base', 'shared'] },
                    permutations: [
                        {
                            condition: "query.block_state('growth') == 1",
                            components: { 'minecraft:tags': ['grown', 'shared'] }
                        }
                    ]
                })
            ],
            { statePalette: emptyPalette }
        );
        const type = resolved.types.get('test:tagged')!;
        const base = type.state({ growth: 0 });
        const grown = type.state({ growth: 1 });

        expect(base.tags).toEqual(['base', 'shared']);
        expect(base.hasTag('base')).toBe(true);
        expect(base.hasTag('grown')).toBe(false);
        expect(grown.tags).toEqual(['grown', 'shared']);
        expect(grown.hasTag('base')).toBe(false);
        expect(grown.hasTag('grown')).toBe(true);
        expect(grown.hasTag('missing')).toBe(false);
        expect(grown.content.params(tags)).toEqual(grown.tags);
    });

    it('resolves one content type per distinct permutation set, not per state', () => {
        const resolved = resolveBlocks([shelfMushroom()], { statePalette: emptyPalette });
        const type = resolved.types.get('minecraft:shelf_mushroom')!;

        expect(type.state({ growth: 0 }).content).not.toBe(type.state({ growth: 1 }).content);

        const stairs = resolveBlocks([definition('minecraft:oak_stairs', {})]).types.get('minecraft:oak_stairs')!;
        expect(new Set(stairs.states.map((state) => state.content)).size).toBe(1);
    });

    it('expands a trait into the states the captured palette declares for it', () => {
        const resolved = resolveBlocks([
            definition('test:knob', {
                description: {
                    identifier: 'test:knob',
                    traits: { 'minecraft:placement_direction': { enabled_states: ['minecraft:cardinal_direction'] } }
                }
            })
        ]);

        expect(resolved.types.get('test:knob')?.model.names()).toEqual(['minecraft:cardinal_direction']);
        expect(resolved.types.get('test:knob')?.states).toHaveLength(4);
    });

    it('resolves trait-provided states outside the vanilla palette domains', () => {
        const resolved = resolveBlocks([
            definition('test:spinner', {
                description: {
                    identifier: 'test:spinner',
                    traits: {
                        'minecraft:placement_direction': { enabled_states: ['minecraft:sixteen_way_rotation'] }
                    }
                }
            })
        ]);

        const spinner = resolved.types.get('test:spinner')!;
        expect(resolved.diagnostics).toEqual([]);
        expect(spinner.model.names()).toEqual(['minecraft:sixteen_way_rotation']);
        expect(spinner.states).toHaveLength(16);

        const cornered = resolveBlocks([
            definition('test:cornered', {
                description: {
                    identifier: 'test:cornered',
                    traits: {
                        'minecraft:placement_direction': {
                            enabled_states: ['minecraft:corner_and_cardinal_direction']
                        }
                    }
                }
            })
        ]).types.get('test:cornered')!;
        expect(cornered.model.names()).toEqual(['minecraft:cardinal_direction', 'minecraft:corner']);
        expect(cornered.states).toHaveLength(20);

        const multiBlock = resolveBlocks([
            definition('test:multi_block', {
                description: {
                    identifier: 'test:multi_block',
                    traits: {
                        'minecraft:multi_block': {
                            enabled_states: ['minecraft:multi_block_part'],
                            direction: 'up',
                            parts: 3
                        }
                    }
                }
            })
        ]).types.get('test:multi_block')!;
        expect(multiBlock.model.names()).toEqual(['minecraft:multi_block_part']);
        expect(multiBlock.states).toHaveLength(3);

        const defaultMultiBlock = resolveBlocks([
            definition('test:default_multi_block', {
                description: {
                    identifier: 'test:default_multi_block',
                    traits: {
                        'minecraft:multi_block': { enabled_states: ['minecraft:multi_block_part'], direction: 'up' }
                    }
                }
            })
        ]).types.get('test:default_multi_block')!;
        expect(defaultMultiBlock.states).toHaveLength(2);
    });

    it('computes the flags a block answers by name', () => {
        const resolved = resolveBlocks(
            [
                definition('test:ghost', { components: { 'minecraft:collision_box': false } }),
                definition('test:solid', {}),
                definition('test:ticker', { components: { 'minecraft:tick': { interval_range: [10, 20] } } })
            ],
            { statePalette: emptyPalette }
        );

        expect(resolved.types.get('test:ghost')!.state().content.flags.solid).toBe(false);
        expect(resolved.types.get('test:solid')!.state().content.flags.solid).toBe(true);
        expect(resolved.types.get('test:ticker')!.state().content.flags.ticking).toBe(true);
        expect(resolved.types.get('test:solid')!.state().content.flags.ticking).toBe(false);
    });

    it('attaches a behavior by identifier and dispatches its hooks', () => {
        const calls: string[] = [];
        const behaviors = new BehaviorRegistry<BlockHooks>();
        behaviors.register({
            name: 'jsprismarine:crop',
            hooks: ['onRandomTick'],
            create: () => ({ onRandomTick: () => void calls.push('grow') })
        });
        behaviors.attach('jsprismarine:crop', 'test:wheat');

        const resolved = resolveBlocks([definition('test:wheat', {})], { behaviors, statePalette: emptyPalette });
        const state = resolved.types.get('test:wheat')!.state();

        state.content.hooks.dispatch('onRandomTick', {
            block: { identifier: 'test:wheat', position: { x: 0, y: 0, z: 0 }, dimension: 'd', states: {} },
            tick: 1
        });

        expect(calls).toEqual(['grow']);
        expect(state.content.flags.randomTicking).toBe(true);
    });

    it('reports a component value that does not parse and keeps the block', () => {
        const resolved = resolveBlocks([definition('test:bad', { components: { 'minecraft:friction': 2 } })], {
            statePalette: emptyPalette
        });

        expect(resolved.types.has('test:bad')).toBe(true);
        expect(resolved.types.get('test:bad')!.state().content.components).toEqual([]);
        expect(resolved.diagnostics[0]?.code).toBe('component.invalid');
    });

    it('fails the whole resolve in strict mode', () => {
        expect(() =>
            resolveBlocks([definition('test:bad', { components: { 'minecraft:friction': 2 } })], {
                statePalette: emptyPalette,
                strict: true
            })
        ).toThrow(BlockLoadError);
    });

    it('keeps the parsed parameters readable through the factory that produced them', () => {
        const resolved = resolveBlocks(
            [
                definition('test:rock', {
                    components: { 'minecraft:destructible_by_mining': { seconds_to_destroy: 1.5 } }
                })
            ],
            { statePalette: emptyPalette }
        );

        const mining = resolved.types.get('test:rock')!.state().content.params(destructibleByMining);
        expect(mining).toEqual({ secondsToDestroy: 1.5, itemSpecificSpeeds: [] });
    });

    it('skips a file with no identifier and reports it', () => {
        const resolved = resolveBlocks([
            {
                identifier: '',
                registry: 'blocks',
                pack: 'test',
                path: 'blocks/broken.json',
                data: { format_version: '1.26.50', 'minecraft:block': {} }
            }
        ]);

        expect(resolved.types.size).toBe(0);
        expect(resolved.diagnostics[0]?.code).toBe('block.malformed');
    });

    it('gives a block with no palette entry and no declared states one state', () => {
        const resolved = resolveBlocks([definition('test:plain', {})], { statePalette: emptyPalette });

        expect(resolved.types.get('test:plain')?.model).toBeInstanceOf(BlockStateModel);
        expect(resolved.states).toHaveLength(1);
    });
});
