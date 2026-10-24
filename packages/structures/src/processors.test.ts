import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { NBTTagCompound, Types } from '@jsprismarine/nbt';
import { describe, expect, it } from 'vitest';

import type { ProcessorBlock, ProcessorContext } from './processors';
import {
    BLOCK_ENTITY_MODIFIER_TYPES,
    POS_RULE_TEST_TYPES,
    PROCESSOR_TYPES,
    RULE_TEST_TYPES,
    applyProcessors,
    createProcessor,
    createProcessorList,
    parseBlockStateString
} from './processors';
import { createLegacyRandom } from './random';
import type { BedrockBlockState, BedrockStructureTemplate } from './types';
import { NO_BLOCK, StructureFormatError } from './types';

const bedrockOf = (javaId: string, properties: Record<string, string> = {}): BedrockBlockState => {
    const result = javaBlockStateToBedrock(javaId, properties);
    if (result.kind === 'unknown') throw new Error(`${javaId} is not a Java 26.3 block state`);
    return result.bedrock;
};

const context = (overrides: Partial<ProcessorContext> = {}): ProcessorContext => ({
    origin: [0, 0, 0],
    random: createLegacyRandom(1234),
    ...overrides
});

const block = (overrides: Partial<ProcessorBlock> & Pick<ProcessorBlock, 'state'>): ProcessorBlock => ({
    pos: [0, 0, 0],
    ...overrides
});

describe('the registered type lists', () => {
    it('match the counts Java 26.3 registers', () => {
        expect(PROCESSOR_TYPES).toHaveLength(11);
        expect(RULE_TEST_TYPES).toHaveLength(10);
        expect(POS_RULE_TEST_TYPES).toHaveLength(3);
        expect(BLOCK_ENTITY_MODIFIER_TYPES).toHaveLength(4);
    });

    it('build a processor for every registered type', () => {
        const definitions: Record<string, unknown> = {
            'minecraft:blackstone_replace': {},
            'minecraft:block_age': { mossiness: 0.5 },
            'minecraft:block_ignore': { blocks: ['minecraft:air'] },
            'minecraft:block_rot': { integrity: 0.9 },
            'minecraft:capped': { delegate: { processor_type: 'minecraft:nop' }, limit: 2 },
            'minecraft:gravity': { heightmap: 'WORLD_SURFACE_WG', offset: 0 },
            'minecraft:jigsaw_replacement': {},
            'minecraft:lava_submerged_block': {},
            'minecraft:nop': {},
            'minecraft:protected_blocks': { value: '#minecraft:features_cannot_replace' },
            'minecraft:rule': { rules: [] }
        };

        for (const type of PROCESSOR_TYPES) {
            const processor = createProcessor({ processor_type: type, ...(definitions[type] as object) });
            expect(processor.type).toBe(type);
        }
    });

    it('rejects an unknown processor type', () => {
        expect(() => createProcessor({ processor_type: 'minecraft:sprinkles' })).toThrow(StructureFormatError);
    });
});

describe('the nop processor', () => {
    it('returns the block it was given', () => {
        const input = block({ state: bedrockOf('minecraft:stone') });

        expect(createProcessor({ processor_type: 'minecraft:nop' }).process(input, context())).toBe(input);
    });
});

describe('the rule processor', () => {
    const replaceGravel = (extra: Record<string, unknown> = {}) =>
        createProcessor({
            processor_type: 'minecraft:rule',
            rules: [
                {
                    input_predicate: { predicate_type: 'minecraft:block_match', block: 'minecraft:gravel' },
                    location_predicate: { predicate_type: 'minecraft:always_true' },
                    output_state: 'minecraft:suspicious_gravel',
                    ...extra
                }
            ]
        });

    it('replaces a matching block and leaves the rest alone', () => {
        const processor = replaceGravel();

        expect(processor.process(block({ state: bedrockOf('minecraft:gravel') }), context())?.state).toEqual(
            bedrockOf('minecraft:suspicious_gravel')
        );
        expect(processor.process(block({ state: bedrockOf('minecraft:stone') }), context())?.state).toEqual(
            bedrockOf('minecraft:stone')
        );
    });

    it('stops at the first rule that matches', () => {
        const processor = createProcessor({
            processor_type: 'minecraft:rule',
            rules: [
                {
                    input_predicate: { predicate_type: 'minecraft:always_true' },
                    location_predicate: { predicate_type: 'minecraft:always_true' },
                    output_state: 'minecraft:dirt'
                },
                {
                    input_predicate: { predicate_type: 'minecraft:always_true' },
                    location_predicate: { predicate_type: 'minecraft:always_true' },
                    output_state: 'minecraft:coarse_dirt'
                }
            ]
        });

        expect(processor.process(block({ state: bedrockOf('minecraft:gravel') }), context())?.state).toEqual(
            bedrockOf('minecraft:dirt')
        );
    });

    it('draws for random_block_match, so a seed decides the outcome', () => {
        const processor = createProcessor({
            processor_type: 'minecraft:rule',
            rules: [
                {
                    input_predicate: {
                        predicate_type: 'minecraft:random_block_match',
                        block: 'minecraft:gravel',
                        probability: 0.5
                    },
                    location_predicate: { predicate_type: 'minecraft:always_true' },
                    output_state: 'minecraft:dirt'
                }
            ]
        });
        const run = (seed: number) => {
            const shared = context({ random: createLegacyRandom(seed) });
            return Array.from(
                { length: 6 },
                () => processor.process(block({ state: bedrockOf('minecraft:gravel') }), shared)?.state.name
            );
        };

        expect(run(42)).toEqual(run(42));
        expect(new Set(run(42)).size).toBe(2);
    });

    it('checks the world block through the location predicate', () => {
        const processor = replaceGravel({
            location_predicate: { predicate_type: 'minecraft:block_match', block: 'minecraft:water' }
        });
        const input = block({ state: bedrockOf('minecraft:gravel') });

        expect(processor.process(input, context({ blockAt: () => bedrockOf('minecraft:water') }))?.state.name).toBe(
            'minecraft:suspicious_gravel'
        );
        expect(processor.process(input, context({ blockAt: () => bedrockOf('minecraft:stone') }))?.state.name).toBe(
            'minecraft:gravel'
        );
    });

    it('fades a replacement with distance through axis_aligned_linear_pos', () => {
        const processor = replaceGravel({
            position_predicate: {
                predicate_type: 'minecraft:axis_aligned_linear_pos',
                axis: 'y',
                min_chance: 0,
                max_chance: 1,
                min_dist: 0,
                max_dist: 10
            }
        });
        const replacedAt = (y: number) => {
            const shared = context({ random: createLegacyRandom(7) });
            return Array.from({ length: 40 }, () =>
                processor.process(block({ pos: [0, y, 0], state: bedrockOf('minecraft:gravel') }), shared)
            ).filter((result) => result?.state.name === 'minecraft:suspicious_gravel').length;
        };

        expect(replacedAt(0)).toBe(0);
        expect(replacedAt(20)).toBe(40);
        expect(replacedAt(5)).toBeGreaterThan(0);
        expect(replacedAt(5)).toBeLessThan(40);
    });

    it('matches a tag through the injected tag lookup and appends a loot table', () => {
        const processor = createProcessor({
            processor_type: 'minecraft:rule',
            rules: [
                {
                    input_predicate: {
                        predicate_type: 'minecraft:tag_match',
                        tag: 'minecraft:trail_ruins_replaceable'
                    },
                    location_predicate: { predicate_type: 'minecraft:always_true' },
                    output_state: 'minecraft:suspicious_gravel',
                    block_entity_modifier: {
                        type: 'minecraft:append_loot',
                        loot_table: 'minecraft:archaeology/trail_ruins_common'
                    }
                }
            ]
        });

        const result = processor.process(
            block({ state: bedrockOf('minecraft:gravel') }),
            context({ hasTag: (identifier) => identifier === 'minecraft:gravel' })
        );

        expect(result?.state.name).toBe('minecraft:suspicious_gravel');
        expect(result?.nbt?.getString('LootTable', '')).toBe('minecraft:archaeology/trail_ruins_common');
    });

    it('clears the block entity when the rule says so', () => {
        const nbt = new NBTTagCompound();
        nbt.addValue('id', new Types.StringVal('minecraft:chest'));
        const processor = replaceGravel({ block_entity_modifier: { type: 'minecraft:clear' } });

        expect(processor.process(block({ state: bedrockOf('minecraft:gravel'), nbt }), context())?.nbt).toBeUndefined();
    });

    it('combines tests with not, all_of and any_of', () => {
        const processor = createProcessor({
            processor_type: 'minecraft:rule',
            rules: [
                {
                    input_predicate: {
                        predicate_type: 'minecraft:all_of',
                        tests: [
                            {
                                predicate_type: 'minecraft:not',
                                predicate: { predicate_type: 'minecraft:block_match', block: 'minecraft:stone' }
                            },
                            {
                                predicate_type: 'minecraft:any_of',
                                tests: [
                                    { predicate_type: 'minecraft:block_match', block: 'minecraft:gravel' },
                                    { predicate_type: 'minecraft:block_match', block: 'minecraft:dirt' }
                                ]
                            }
                        ]
                    },
                    location_predicate: { predicate_type: 'minecraft:always_true' },
                    output_state: 'minecraft:cobblestone'
                }
            ]
        });

        expect(processor.process(block({ state: bedrockOf('minecraft:dirt') }), context())?.state.name).toBe(
            'minecraft:cobblestone'
        );
        expect(processor.process(block({ state: bedrockOf('minecraft:stone') }), context())?.state.name).toBe(
            'minecraft:stone'
        );
    });

    it('matches a height band', () => {
        const processor = replaceGravel({
            input_predicate: { predicate_type: 'minecraft:height_match', min_inclusive: 10, max_inclusive: 20 }
        });
        const at = (y: number) =>
            processor.process(block({ pos: [0, y, 0], state: bedrockOf('minecraft:gravel') }), context())?.state.name;

        expect(at(15)).toBe('minecraft:suspicious_gravel');
        expect(at(21)).toBe('minecraft:gravel');
    });
});

describe('the block_ignore processor', () => {
    it('drops the listed blocks', () => {
        const processor = createProcessor({
            processor_type: 'minecraft:block_ignore',
            blocks: ['minecraft:air', 'minecraft:structure_void']
        });

        expect(processor.process(block({ state: bedrockOf('minecraft:air') }), context())).toBeUndefined();
        expect(processor.process(block({ state: bedrockOf('minecraft:stone') }), context())).toBeDefined();
    });
});

describe('the block_rot processor', () => {
    it('keeps a block when the draw is at most the integrity', () => {
        const processor = createProcessor({ processor_type: 'minecraft:block_rot', integrity: 0.5 });
        const shared = context({ random: createLegacyRandom(99) });
        const kept = Array.from(
            { length: 200 },
            () => processor.process(block({ state: bedrockOf('minecraft:stone') }), shared) !== undefined
        ).filter(Boolean).length;

        expect(kept).toBeGreaterThan(70);
        expect(kept).toBeLessThan(130);
    });

    it('only rots the blocks in the named tag', () => {
        const processor = createProcessor({
            processor_type: 'minecraft:block_rot',
            integrity: 0,
            rottable_blocks: '#minecraft:ancient_city_replaceable'
        });
        const rotting = context({ hasTag: (identifier) => identifier === 'minecraft:deepslate_bricks' });

        expect(processor.process(block({ state: bedrockOf('minecraft:deepslate_bricks') }), rotting)).toBeUndefined();
        expect(processor.process(block({ state: bedrockOf('minecraft:stone') }), rotting)).toBeDefined();
    });
});

describe('the gravity processor', () => {
    it('drops the block onto the surface, keeping its height inside the template', () => {
        const processor = createProcessor({
            processor_type: 'minecraft:gravity',
            heightmap: 'WORLD_SURFACE_WG',
            offset: -1
        });

        const result = processor.process(
            block({ pos: [2, 3, 4], state: bedrockOf('minecraft:stone') }),
            context({ origin: [100, 60, 100], heightAt: () => 70 })
        );

        // The surface is 70, the offset moves it one down, and the block sits
        // three above the template floor, so the world y is 72 and the
        // template-relative y is 72 minus the origin's 60.
        expect(result?.pos).toEqual([2, 12, 4]);
    });

    it('leaves the block alone when no heightmap is available', () => {
        const processor = createProcessor({ processor_type: 'minecraft:gravity', offset: 0 });
        const input = block({ pos: [0, 5, 0], state: bedrockOf('minecraft:stone') });

        expect(processor.process(input, context())?.pos).toEqual([0, 5, 0]);
    });
});

describe('the protected_blocks processor', () => {
    it('drops a block where the world holds something the tag protects', () => {
        const processor = createProcessor({
            processor_type: 'minecraft:protected_blocks',
            value: '#minecraft:features_cannot_replace'
        });
        const world = context({
            blockAt: () => bedrockOf('minecraft:bedrock'),
            hasTag: (identifier) => identifier === 'minecraft:bedrock'
        });

        expect(processor.process(block({ state: bedrockOf('minecraft:stone') }), world)).toBeUndefined();
    });

    it('keeps a block where the world holds something else', () => {
        const processor = createProcessor({
            processor_type: 'minecraft:protected_blocks',
            value: '#minecraft:features_cannot_replace'
        });
        const world = context({ blockAt: () => bedrockOf('minecraft:dirt'), hasTag: () => false });

        expect(processor.process(block({ state: bedrockOf('minecraft:stone') }), world)).toBeDefined();
    });
});

describe('the lava_submerged_block processor', () => {
    it('floods a block that does not fill its cell', () => {
        const processor = createProcessor({ processor_type: 'minecraft:lava_submerged_block' });
        const submerged = context({ blockAt: () => bedrockOf('minecraft:lava'), isFullBlock: () => false });

        expect(processor.process(block({ state: bedrockOf('minecraft:air') }), submerged)?.state.name).toBe(
            'minecraft:lava'
        );
    });

    it('leaves a full block, and anything not in lava, alone', () => {
        const processor = createProcessor({ processor_type: 'minecraft:lava_submerged_block' });

        expect(
            processor.process(
                block({ state: bedrockOf('minecraft:stone') }),
                context({ blockAt: () => bedrockOf('minecraft:lava'), isFullBlock: () => true })
            )?.state.name
        ).toBe('minecraft:stone');
        expect(
            processor.process(
                block({ state: bedrockOf('minecraft:air') }),
                context({ blockAt: () => bedrockOf('minecraft:water'), isFullBlock: () => false })
            )?.state.name
        ).toBe('minecraft:air');
    });
});

describe('the jigsaw_replacement processor', () => {
    const jigsawNbt = (finalState: string) => {
        const nbt = new NBTTagCompound();
        nbt.addValue('final_state', new Types.StringVal(finalState));
        return nbt;
    };

    it('leaves the jigsaw block as the state its final_state names', () => {
        const processor = createProcessor({ processor_type: 'minecraft:jigsaw_replacement' });
        const result = processor.process(
            block({
                state: bedrockOf('minecraft:jigsaw', { orientation: 'north_up' }),
                nbt: jigsawNbt('minecraft:oak_planks')
            }),
            context()
        );

        expect(result?.state).toEqual(bedrockOf('minecraft:oak_planks'));
        expect(result?.nbt).toBeUndefined();
    });

    it('drops a jigsaw whose final_state is structure void', () => {
        const processor = createProcessor({ processor_type: 'minecraft:jigsaw_replacement' });

        expect(
            processor.process(
                block({
                    state: bedrockOf('minecraft:jigsaw', { orientation: 'north_up' }),
                    nbt: jigsawNbt('minecraft:structure_void')
                }),
                context()
            )
        ).toBeUndefined();
    });

    it('leaves blocks that are not jigsaws alone', () => {
        const processor = createProcessor({ processor_type: 'minecraft:jigsaw_replacement' });
        const input = block({ state: bedrockOf('minecraft:stone') });

        expect(processor.process(input, context())).toBe(input);
    });
});

describe('parseBlockStateString', () => {
    it('reads the identifier and the property list a jigsaw block entity stores', () => {
        expect(parseBlockStateString('minecraft:oak_log[axis=x]')).toEqual(
            bedrockOf('minecraft:oak_log', { axis: 'x' })
        );
        expect(parseBlockStateString('oak_planks')).toEqual(bedrockOf('minecraft:oak_planks'));
        expect(parseBlockStateString('minecraft:not_a_block')).toBeUndefined();
    });
});

describe('the blackstone_replace processor', () => {
    it('swaps the stone family for the blackstone family', () => {
        const processor = createProcessor({ processor_type: 'minecraft:blackstone_replace' });

        expect(processor.process(block({ state: bedrockOf('minecraft:cobblestone') }), context())?.state.name).toBe(
            'minecraft:blackstone'
        );
        expect(processor.process(block({ state: bedrockOf('minecraft:stone_bricks') }), context())?.state.name).toBe(
            'minecraft:polished_blackstone_bricks'
        );
    });

    it('keeps the state values the replacement also declares', () => {
        const processor = createProcessor({ processor_type: 'minecraft:blackstone_replace' });
        const stairs = bedrockOf('minecraft:cobblestone_stairs', { facing: 'east', half: 'top', shape: 'straight' });

        const result = processor.process(block({ state: stairs }), context());

        expect(result?.state.name).toBe('minecraft:blackstone_stairs');
        expect(result?.state.states).toMatchObject({
            weirdo_direction: stairs.states.weirdo_direction,
            upside_down_bit: stairs.states.upside_down_bit
        });
    });

    it('leaves a block outside the map alone', () => {
        const processor = createProcessor({ processor_type: 'minecraft:blackstone_replace' });

        expect(processor.process(block({ state: bedrockOf('minecraft:oak_planks') }), context())?.state.name).toBe(
            'minecraft:oak_planks'
        );
    });
});

describe('the block_age processor', () => {
    it('leaves everything alone at zero mossiness, except the obsidian it cracks', () => {
        const processor = createProcessor({ processor_type: 'minecraft:block_age', mossiness: 0 });
        const shared = context({ random: createLegacyRandom(5) });
        const results = Array.from({ length: 50 }, () =>
            processor.process(block({ state: bedrockOf('minecraft:stone_bricks') }), shared)
        );

        expect(new Set(results.map((result) => result?.state.name))).toEqual(
            new Set(['minecraft:stone_bricks', 'minecraft:cracked_stone_bricks', 'minecraft:stone_brick_stairs'])
        );
    });

    it('produces mossy variants at full mossiness', () => {
        const processor = createProcessor({ processor_type: 'minecraft:block_age', mossiness: 1 });
        const shared = context({ random: createLegacyRandom(5) });
        const names = new Set(
            Array.from(
                { length: 50 },
                () => processor.process(block({ state: bedrockOf('minecraft:stone_bricks') }), shared)?.state.name
            )
        );

        expect(names.has('minecraft:mossy_stone_bricks')).toBe(true);
        expect(names.has('minecraft:cracked_stone_bricks')).toBe(false);
    });

    it('turns obsidian into crying obsidian about fifteen percent of the time', () => {
        const processor = createProcessor({ processor_type: 'minecraft:block_age', mossiness: 0 });
        const shared = context({ random: createLegacyRandom(11) });
        const crying = Array.from(
            { length: 1000 },
            () => processor.process(block({ state: bedrockOf('minecraft:obsidian') }), shared)?.state.name
        ).filter((name) => name === 'minecraft:crying_obsidian').length;

        expect(crying).toBeGreaterThan(110);
        expect(crying).toBeLessThan(190);
    });
});

describe('the capped processor', () => {
    const template = (count: number): BedrockStructureTemplate => ({
        size: [count, 1, 1],
        palette: [bedrockOf('minecraft:gravel')],
        blocks: Array.from({ length: count }, (_, index) => ({
            pos: [index, 0, 0] as const,
            state: 0,
            extraState: NO_BLOCK
        })),
        entities: []
    });

    const cappedReplace = (limit: unknown) =>
        createProcessor({
            processor_type: 'minecraft:capped',
            limit,
            delegate: {
                processor_type: 'minecraft:rule',
                rules: [
                    {
                        input_predicate: { predicate_type: 'minecraft:block_match', block: 'minecraft:gravel' },
                        location_predicate: { predicate_type: 'minecraft:always_true' },
                        output_state: 'minecraft:suspicious_gravel'
                    }
                ]
            }
        });

    it('replaces no more blocks than the limit allows', () => {
        const result = applyProcessors(template(20), [cappedReplace(3)], context({ random: createLegacyRandom(2024) }));
        const replaced = result.blocks.filter(
            (entry) => result.palette[entry.state]?.name === 'minecraft:suspicious_gravel'
        );

        expect(replaced).toHaveLength(3);
    });

    it('picks the same blocks for the same seed and different blocks for another', () => {
        const positions = (seed: number) => {
            const result = applyProcessors(
                template(20),
                [cappedReplace(3)],
                context({ random: createLegacyRandom(seed) })
            );
            return result.blocks
                .filter((entry) => result.palette[entry.state]?.name === 'minecraft:suspicious_gravel')
                .map((entry) => entry.pos[0]);
        };

        expect(positions(2024)).toEqual(positions(2024));
        expect(positions(2024)).not.toEqual(positions(7));
    });

    it('does nothing when the limit is zero', () => {
        const result = applyProcessors(template(5), [cappedReplace(0)], context());

        expect(result.palette.map((state) => state.name)).toEqual(['minecraft:gravel']);
    });

    it('samples a uniform int provider for the limit', () => {
        const result = applyProcessors(
            template(20),
            [cappedReplace({ type: 'minecraft:uniform', min_inclusive: 2, max_inclusive: 4 })],
            context({ random: createLegacyRandom(2024) })
        );
        const replaced = result.blocks.filter(
            (entry) => result.palette[entry.state]?.name === 'minecraft:suspicious_gravel'
        ).length;

        expect(replaced).toBeGreaterThanOrEqual(2);
        expect(replaced).toBeLessThanOrEqual(4);
    });
});

describe('createProcessorList and applyProcessors', () => {
    it('reads a vanilla processor list file and runs it in order', () => {
        const processors = createProcessorList({
            processors: [
                {
                    processor_type: 'minecraft:rule',
                    rules: [
                        {
                            input_predicate: { predicate_type: 'minecraft:block_match', block: 'minecraft:gravel' },
                            location_predicate: { predicate_type: 'minecraft:always_true' },
                            output_state: 'minecraft:dirt'
                        }
                    ]
                },
                { processor_type: 'minecraft:block_ignore', blocks: ['minecraft:air'] }
            ]
        });

        const template: BedrockStructureTemplate = {
            size: [3, 1, 1],
            palette: [bedrockOf('minecraft:gravel'), bedrockOf('minecraft:air'), bedrockOf('minecraft:stone')],
            blocks: [
                { pos: [0, 0, 0], state: 0, extraState: NO_BLOCK },
                { pos: [1, 0, 0], state: 1, extraState: NO_BLOCK },
                { pos: [2, 0, 0], state: 2, extraState: NO_BLOCK }
            ],
            entities: []
        };

        const result = applyProcessors(template, processors, context());

        expect(result.blocks.map((entry) => result.palette[entry.state]?.name)).toEqual([
            'minecraft:dirt',
            'minecraft:stone'
        ]);
    });

    it('carries the second block layer through untouched', () => {
        const template: BedrockStructureTemplate = {
            size: [1, 1, 1],
            palette: [bedrockOf('minecraft:gravel'), bedrockOf('minecraft:water', { level: '0' })],
            blocks: [{ pos: [0, 0, 0], state: 0, extraState: 1 }],
            entities: []
        };

        const result = applyProcessors(
            template,
            createProcessorList([
                {
                    processor_type: 'minecraft:rule',
                    rules: [
                        {
                            input_predicate: { predicate_type: 'minecraft:always_true' },
                            location_predicate: { predicate_type: 'minecraft:always_true' },
                            output_state: 'minecraft:suspicious_gravel'
                        }
                    ]
                }
            ]),
            context()
        );

        expect(result.palette[result.blocks[0]?.state ?? -1]?.name).toBe('minecraft:suspicious_gravel');
        expect(result.palette[result.blocks[0]?.extraState ?? -1]?.name).toBe('minecraft:water');
    });
});
