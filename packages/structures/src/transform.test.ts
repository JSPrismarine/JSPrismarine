import { javaBlockStateToBedrock } from '@jsprismarine/mapping';
import { blocksTable } from '@jsprismarine/mapping/tables';
import { describe, expect, it } from 'vitest';

import transformTable from './tables/stateTransforms.json';

import type { Rotation } from './tableShape';
import {
    AMBIGUOUS_STATE_TRANSFORMS,
    mirrorBedrockState,
    rotateBedrockState,
    transformEntityPosition,
    transformPosition,
    transformTemplate,
    transformedSize,
    verifyStateTransforms
} from './transform';
import type { BedrockBlockState, BedrockStructureTemplate } from './types';
import { NO_BLOCK } from './types';

/** The Bedrock state a Java state maps to, so the test names directions in Java's vocabulary. */
const bedrockOf = (javaId: string, properties: Record<string, string>): BedrockBlockState => {
    const result = javaBlockStateToBedrock(javaId, properties);
    if (result.kind === 'unknown') throw new Error(`${javaId} is not a Java 26.3 block state`);
    return result.bedrock;
};

const QUARTER_TURNS: Rotation[] = ['clockwise_90', 'clockwise_180', 'counterclockwise_90'];

describe('rotateBedrockState', () => {
    it('turns a stair through the four Java facings in order', () => {
        const stair = (facing: string) =>
            bedrockOf('minecraft:oak_stairs', { facing, half: 'bottom', shape: 'straight', waterlogged: 'false' });

        expect(rotateBedrockState(stair('north'), 'clockwise_90')).toEqual(stair('east'));
        expect(rotateBedrockState(stair('east'), 'clockwise_90')).toEqual(stair('south'));
        expect(rotateBedrockState(stair('south'), 'clockwise_90')).toEqual(stair('west'));
        expect(rotateBedrockState(stair('west'), 'clockwise_90')).toEqual(stair('north'));
    });

    it('swaps the two horizontal axes of a log and leaves the vertical one alone', () => {
        const log = (axis: string) => bedrockOf('minecraft:oak_log', { axis });

        expect(rotateBedrockState(log('x'), 'clockwise_90')).toEqual(log('z'));
        expect(rotateBedrockState(log('z'), 'clockwise_90')).toEqual(log('x'));
        expect(rotateBedrockState(log('y'), 'clockwise_90')).toEqual(log('y'));
    });

    it('leaves a slab, which has no horizontal direction, alone', () => {
        const slab = bedrockOf('minecraft:oak_slab', { type: 'top', waterlogged: 'false' });

        for (const rotation of QUARTER_TURNS) expect(rotateBedrockState(slab, rotation)).toEqual(slab);
    });

    it('turns four times back to where it started, for every state of every directional block', () => {
        const samples = [
            bedrockOf('minecraft:oak_stairs', { facing: 'north', half: 'top', shape: 'inner_left' }),
            bedrockOf('minecraft:oak_log', { axis: 'x' }),
            bedrockOf('minecraft:rail', { shape: 'ascending_north' }),
            bedrockOf('minecraft:ladder', { facing: 'east' }),
            bedrockOf('minecraft:jigsaw', { orientation: 'north_up' }),
            bedrockOf('minecraft:oak_door', { facing: 'west', half: 'upper', hinge: 'right', open: 'true' }),
            bedrockOf('minecraft:lever', { face: 'wall', facing: 'south', powered: 'true' }),
            bedrockOf('minecraft:cobblestone_wall', { north: 'tall', east: 'low', south: 'none', west: 'none' }),
            bedrockOf('minecraft:vine', { north: 'true', east: 'false', south: 'true', west: 'false', up: 'false' })
        ];

        for (const state of samples) {
            const once = rotateBedrockState(state, 'clockwise_90');
            const twice = rotateBedrockState(once, 'clockwise_90');
            const thrice = rotateBedrockState(twice, 'clockwise_90');

            expect(rotateBedrockState(thrice, 'clockwise_90')).toEqual(state);
            expect(twice).toEqual(rotateBedrockState(state, 'clockwise_180'));
            expect(thrice).toEqual(rotateBedrockState(state, 'counterclockwise_90'));
        }
    });

    it('leaves a state with no rule unchanged', () => {
        const bedrockOnly = { name: 'minecraft:sulfur_spike', states: { dripstone_thickness: 'tip', hanging: 0 } };

        expect(rotateBedrockState(bedrockOnly, 'clockwise_90')).toEqual(bedrockOnly);
    });
});

describe('mirrorBedrockState', () => {
    it('reflects a ladder across each axis', () => {
        const ladder = (facing: string) => bedrockOf('minecraft:ladder', { facing });

        expect(mirrorBedrockState(ladder('north'), 'left_right')).toEqual(ladder('south'));
        expect(mirrorBedrockState(ladder('east'), 'left_right')).toEqual(ladder('east'));
        expect(mirrorBedrockState(ladder('east'), 'front_back')).toEqual(ladder('west'));
        expect(mirrorBedrockState(ladder('north'), 'front_back')).toEqual(ladder('north'));
    });

    it('swaps a stair corner the way Java 26.3 does, which is not symmetric', () => {
        const stair = (facing: string, shape: string) =>
            bedrockOf('minecraft:oak_stairs', { facing, half: 'bottom', shape });

        // Measured from the pinned server jar: `StairBlock.mirror` swaps the
        // corner only for a z-facing stair under `left_right`. A reflection
        // reverses handedness, so an x-facing stair under `front_back` ought
        // to swap too, and Java does not do it. Matching Java is the point.
        expect(mirrorBedrockState(stair('north', 'inner_left'), 'left_right')).toEqual(stair('south', 'inner_right'));
        expect(mirrorBedrockState(stair('east', 'inner_left'), 'left_right')).toEqual(stair('east', 'inner_left'));
        expect(mirrorBedrockState(stair('east', 'inner_left'), 'front_back')).toEqual(stair('west', 'inner_left'));
        expect(mirrorBedrockState(stair('north', 'inner_left'), 'front_back')).toEqual(stair('north', 'inner_left'));
    });

    it('is its own inverse', () => {
        const samples = [
            bedrockOf('minecraft:oak_stairs', { facing: 'north', half: 'top', shape: 'outer_right' }),
            bedrockOf('minecraft:rail', { shape: 'south_east' }),
            bedrockOf('minecraft:jigsaw', { orientation: 'down_west' })
        ];

        for (const state of samples) {
            for (const mirror of ['left_right', 'front_back'] as const) {
                expect(mirrorBedrockState(mirrorBedrockState(state, mirror), mirror)).toEqual(state);
            }
        }
    });
});

describe('verifyStateTransforms', () => {
    it('finds no inconsistency in the generated table', () => {
        expect(verifyStateTransforms()).toEqual([]);
    });

    it('names the huge mushroom blocks as the only ambiguous transforms', () => {
        expect([...new Set(AMBIGUOUS_STATE_TRANSFORMS.map((entry) => entry.identifier))].sort()).toEqual([
            'minecraft:brown_mushroom_block',
            'minecraft:red_mushroom_block'
        ]);
    });
});

describe('the transform table against the mapping state domains', () => {
    /** Every Bedrock state the pinned palette declares, as `name|key=value,...`. */
    const paletteStates = new Set(
        blocksTable.statePalette.flatMap(([name, keys, tuples]) =>
            tuples.map((values) => {
                const states = keys
                    .map((key, axis) => [key, values[axis] ?? ''] as const)
                    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
                    .map(([key, value]) => `${key}=${value}`)
                    .join(',');
                return `minecraft:${name}|${states}`;
            })
        )
    );

    const keyOf = (state: BedrockBlockState): string =>
        `${state.name}|${Object.keys(state.states)
            .sort()
            .map((key) => `${key}=${state.states[key]}`)
            .join(',')}`;

    it('covers the same palette the mapping declares', () => {
        expect(transformTable.paletteStateCount).toBe(paletteStates.size);
        expect(transformTable.bedrockVersion).toBe(blocksTable.bedrockVersion);
        expect(transformTable.geyserMappingsCommit).toBe(blocksTable.geyserMappingsCommit);
    });

    it('turns and reflects every palette state into another state the palette declares', () => {
        const mismatched: string[] = [];

        for (const [name, keys, tuples] of blocksTable.statePalette) {
            for (const values of tuples) {
                const state: BedrockBlockState = {
                    name: `minecraft:${name}`,
                    states: Object.fromEntries(keys.map((key, axis) => [key, values[axis] ?? '']))
                };
                for (const rotation of QUARTER_TURNS) {
                    const turned = keyOf(rotateBedrockState(state, rotation));
                    if (!paletteStates.has(turned)) mismatched.push(`${keyOf(state)} ${rotation} -> ${turned}`);
                }
                for (const mirror of ['left_right', 'front_back'] as const) {
                    const flipped = keyOf(mirrorBedrockState(state, mirror));
                    if (!paletteStates.has(flipped)) mismatched.push(`${keyOf(state)} ${mirror} -> ${flipped}`);
                }
            }
        }

        expect(mismatched).toEqual([]);
    });
});

describe('transformPosition', () => {
    const size = [3, 1, 5] as const;

    it('keeps a quarter turn inside the transformed template', () => {
        expect(transformedSize(size, { rotation: 'clockwise_90' })).toEqual([5, 1, 3]);
        expect(transformPosition(size, [0, 0, 0], { rotation: 'clockwise_90' })).toEqual([4, 0, 0]);
        expect(transformPosition(size, [2, 0, 4], { rotation: 'clockwise_90' })).toEqual([0, 0, 2]);
    });

    it('returns to the start after four quarter turns', () => {
        let position: readonly [number, number, number] = [1, 0, 3];
        let extent: readonly [number, number, number] = size;

        for (let turn = 0; turn < 4; turn++) {
            position = transformPosition(extent, position, { rotation: 'clockwise_90' });
            extent = transformedSize(extent, { rotation: 'clockwise_90' });
        }

        expect(position).toEqual([1, 0, 3]);
        expect(extent).toEqual(size);
    });

    it('reflects about the matching axis', () => {
        expect(transformPosition(size, [0, 0, 1], { mirror: 'front_back' })).toEqual([2, 0, 1]);
        expect(transformPosition(size, [0, 0, 1], { mirror: 'left_right' })).toEqual([0, 0, 3]);
    });

    it('applies the mirror before the rotation, as Java does', () => {
        const mirrored = transformPosition(size, [0, 0, 0], { mirror: 'left_right' });

        expect(transformPosition(size, [0, 0, 0], { mirror: 'left_right', rotation: 'clockwise_90' })).toEqual(
            transformPosition(size, mirrored, { rotation: 'clockwise_90' })
        );
    });

    it('reflects entity positions about the template edge rather than the last block', () => {
        expect(transformEntityPosition(size, [0.5, 0, 1.5], { mirror: 'front_back' })).toEqual([2.5, 0, 1.5]);
        expect(transformEntityPosition(size, [0.5, 0, 1.5], { rotation: 'clockwise_90' })).toEqual([3.5, 0, 0.5]);
    });
});

describe('transformTemplate', () => {
    const template = (): BedrockStructureTemplate => ({
        size: [2, 1, 3],
        palette: [
            bedrockOf('minecraft:oak_stairs', { facing: 'north', half: 'bottom', shape: 'straight' }),
            bedrockOf('minecraft:stone', {})
        ],
        blocks: [
            { pos: [0, 0, 0], state: 0, extraState: NO_BLOCK },
            { pos: [1, 0, 2], state: 1, extraState: 0 }
        ],
        entities: [{ pos: [0.5, 0, 0.5], blockPos: [0, 0, 0] }]
    });

    it('turns the palette, the block positions and the entity positions together', () => {
        const { template: turned, mismatches } = transformTemplate(template(), { rotation: 'clockwise_90' });

        expect(mismatches).toEqual([]);
        expect(turned.size).toEqual([3, 1, 2]);
        expect(turned.palette[0]).toEqual(
            bedrockOf('minecraft:oak_stairs', { facing: 'east', half: 'bottom', shape: 'straight' })
        );
        expect(turned.blocks.map((block) => block.pos)).toEqual([
            [2, 0, 0],
            [0, 0, 1]
        ]);
        expect(turned.entities[0]?.pos).toEqual([2.5, 0, 0.5]);
        expect(turned.entities[0]?.blockPos).toEqual([2, 0, 0]);
    });

    it('keeps the second layer entry on its block', () => {
        const { template: turned } = transformTemplate(template(), { rotation: 'clockwise_180' });

        expect(turned.blocks[1]).toMatchObject({ pos: [0, 0, 0], state: 1, extraState: 0 });
    });

    it('is the identity after four quarter turns', () => {
        let current = template();
        for (let turn = 0; turn < 4; turn++) {
            current = transformTemplate(current, { rotation: 'clockwise_90' }).template;
        }

        expect(current).toEqual(template());
    });

    it('reports a palette state it has no rule for instead of changing it', () => {
        const { template: turned, mismatches } = transformTemplate(
            {
                size: [1, 1, 1],
                palette: [{ name: 'minecraft:sulfur_spike', states: { dripstone_thickness: 'tip', hanging: 0 } }],
                blocks: [{ pos: [0, 0, 0], state: 0, extraState: NO_BLOCK }],
                entities: []
            },
            { rotation: 'clockwise_90' }
        );

        expect(mismatches).toEqual([
            {
                state: { name: 'minecraft:sulfur_spike', states: { dripstone_thickness: 'tip', hanging: 0 } },
                transform: 'clockwise_90',
                reason: 'no-rule'
            }
        ]);
        expect(turned.palette[0]?.states).toEqual({ dripstone_thickness: 'tip', hanging: 0 });
    });

    it('reports a huge mushroom block as ambiguous', () => {
        const { mismatches } = transformTemplate(
            {
                size: [1, 1, 1],
                palette: [
                    bedrockOf('minecraft:brown_mushroom_block', {
                        north: 'true',
                        east: 'false',
                        south: 'false',
                        west: 'false',
                        up: 'false',
                        down: 'false'
                    })
                ],
                blocks: [{ pos: [0, 0, 0], state: 0, extraState: NO_BLOCK }],
                entities: []
            },
            { rotation: 'clockwise_90' }
        );

        expect(mismatches.map((mismatch) => mismatch.reason)).toEqual(['ambiguous']);
    });
});
