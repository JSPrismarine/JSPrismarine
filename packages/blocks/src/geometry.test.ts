import { blockSchemas } from '@jsprismarine/minecraft/generated/block-schemas';
import { reportProgress } from '../../../.test/reportProgress';
import { describe, expect, it } from 'vitest';

import table from './tables/blockGeometry.json' with { type: 'json' };
import {
    BEDROCK_GEOMETRY_STATE_COUNT,
    BLOCKS_WITHOUT_CAPTURED_GEOMETRY,
    FULL_BLOCK,
    PASSABLE,
    bedrockCollisionTopOf,
    bedrockLiquidReactionOf,
    collisionShapeOf,
    FULL_CUBE_SHAPE,
    isFullCubeShape,
    isWashedAway,
    mergedFaceOccludes
} from './geometry';
import { BlockPalette } from './state';
import { resolveBlocks } from './types';

describe('bedrockCollisionTopOf', () => {
    it('reads every table row from the generated JSON asset', () => {
        for (const [identifier, row] of Object.entries(table.blocks)) {
            expect(bedrockCollisionTopOf(identifier)).toBe(row.top);
        }
    });

    it('covers every block the palette declares, except the reviewed newer ones', () => {
        const missing = Object.keys(blockSchemas.blocks).filter(
            (identifier) => bedrockCollisionTopOf(identifier) === undefined
        );
        expect(missing.sort()).toEqual([...BLOCKS_WITHOUT_CAPTURED_GEOMETRY].sort());
        reportProgress(`${BEDROCK_GEOMETRY_STATE_COUNT} captured block geometry state rows are available.`);
    });

    it('gives an ordinary block its own cell', () => {
        expect(bedrockCollisionTopOf('minecraft:stone')).toBe(FULL_BLOCK);
    });

    it('answers nothing for a block no capture knows', () => {
        expect(bedrockCollisionTopOf('plugin:unheard_of')).toBeUndefined();
    });

    it('makes a fence taller than it looks', () => {
        // A mob's jump peaks at 1.252 blocks, so 1.5 is precisely the height
        // that cannot be cleared. Modeled as a cube, every animal hops out.
        expect(bedrockCollisionTopOf('minecraft:oak_fence')).toBe(1.5);
        expect(bedrockCollisionTopOf('minecraft:cobblestone_wall')).toBe(1.5);
    });

    it('walks straight through a plant', () => {
        expect(bedrockCollisionTopOf('minecraft:short_grass')).toBe(PASSABLE);
        expect(bedrockCollisionTopOf('minecraft:wheat')).toBe(PASSABLE);
        expect(bedrockCollisionTopOf('minecraft:torch')).toBe(PASSABLE);
    });

    it('gives a stair the step a mob meets rather than its tallest corner', () => {
        expect(bedrockCollisionTopOf('minecraft:oak_stairs')).toBe(0.5);
    });

    it('knows the blocks no hand-written list did', () => {
        expect(bedrockCollisionTopOf('minecraft:candle')).toBe(0.375);
        expect(bedrockCollisionTopOf('minecraft:cauldron')).toBe(0.3125);
        expect(bedrockCollisionTopOf('minecraft:glow_lichen')).toBe(PASSABLE);
        expect(bedrockCollisionTopOf('minecraft:tube_coral_fan')).toBe(PASSABLE);
        // A full block whose name ends in `_slab`, which a suffix rule read as half of one.
        expect(bedrockCollisionTopOf('minecraft:double_cut_copper_slab')).toBe(FULL_BLOCK);
    });

    it('prefers what the Bedrock client draws over Java', () => {
        // Java's cactus is 0.9375 and its honey block 0.9375; Bedrock's are
        // full cubes, and the client is what decides where a player stands.
        expect(bedrockCollisionTopOf('minecraft:cactus')).toBe(FULL_BLOCK);
        expect(bedrockCollisionTopOf('minecraft:honey_block')).toBe(FULL_BLOCK);
    });
});

describe('bedrockLiquidReactionOf', () => {
    it('dams a liquid with an ordinary block', () => {
        expect(bedrockLiquidReactionOf('minecraft:stone')).toBe('blocking');
        expect(isWashedAway('minecraft:stone')).toBe(false);
    });

    it('pops the blocks a liquid leaves on the ground', () => {
        expect(bedrockLiquidReactionOf('minecraft:wheat')).toBe('popped');
        expect(bedrockLiquidReactionOf('minecraft:white_carpet')).toBe('popped');
        expect(bedrockLiquidReactionOf('minecraft:rail')).toBe('popped');
    });

    it('breaks snow outright', () => {
        expect(bedrockLiquidReactionOf('minecraft:snow_layer')).toBe('broken');
        expect(isWashedAway('minecraft:snow_layer')).toBe(true);
    });

    it('shares a cell with air and with a liquid', () => {
        expect(bedrockLiquidReactionOf('minecraft:air')).toBe('none');
        expect(bedrockLiquidReactionOf('minecraft:water')).toBe('none');
        expect(isWashedAway('minecraft:air')).toBe(true);
    });

    it('answers nothing for a block no capture knows', () => {
        expect(bedrockLiquidReactionOf('plugin:unheard_of')).toBeUndefined();
        expect(isWashedAway('plugin:unheard_of')).toBe(false);
    });
});

describe('collisionShapeOf', () => {
    const stateOf = (components: Record<string, unknown>) =>
        resolveBlocks(
            [
                {
                    identifier: 'test:shape',
                    registry: 'blocks',
                    pack: 'test',
                    path: 'blocks/shape.block.json',
                    data: {
                        format_version: '1.26.50',
                        'minecraft:block': { description: { identifier: 'test:shape' }, components }
                    }
                }
            ],
            { statePalette: new BlockPalette([]) }
        )
            .types.get('test:shape')!
            .state();

    it('takes a block with no collision box component as a full cube', () => {
        expect(collisionShapeOf(stateOf({}))).toEqual(FULL_CUBE_SHAPE);
        expect(collisionShapeOf(stateOf({ 'minecraft:collision_box': true }))).toEqual(FULL_CUBE_SHAPE);
    });

    it('gives a block whose collision box is off no boxes', () => {
        expect(collisionShapeOf(stateOf({ 'minecraft:collision_box': false }))).toEqual([]);
    });

    it('normalizes a bottom slab and a carpet to their cell', () => {
        const slab = stateOf({ 'minecraft:collision_box': { origin: [-8, 0, -8], size: [16, 8, 16] } });
        const carpet = stateOf({ 'minecraft:collision_box': { origin: [-8, 0, -8], size: [16, 1, 16] } });

        expect(collisionShapeOf(slab)).toEqual([[0, 0, 0, 1, 0.5, 1]]);
        expect(collisionShapeOf(carpet)).toEqual([[0, 0, 0, 1, 0.0625, 1]]);
    });

    it('keeps a box that reaches past its cell, as a fence post does', () => {
        const post = stateOf({ 'minecraft:collision_box': { origin: [-2, 0, -2], size: [4, 24, 4] } });

        expect(collisionShapeOf(post)).toEqual([[0.375, 0, 0.375, 0.625, 1.5, 0.625]]);
    });
});

describe('isFullCubeShape', () => {
    it('tells a full cube from a partial shape and from nothing', () => {
        expect(isFullCubeShape(FULL_CUBE_SHAPE)).toBe(true);
        expect(isFullCubeShape([[0, 0, 0, 1, 0.5, 1]])).toBe(false);
        expect(isFullCubeShape([])).toBe(false);
    });

    it('counts boxes that fill the cell together, and not ones that leave a gap', () => {
        expect(
            isFullCubeShape([
                [0, 0, 0, 0.5, 1, 1],
                [0.5, 0, 0, 1, 1, 1]
            ])
        ).toBe(true);
        expect(
            isFullCubeShape([
                [0, 0, 0, 0.5, 1, 1],
                [0.5, 0, 0, 1, 0.5, 1]
            ])
        ).toBe(false);
    });
});

describe('mergedFaceOccludes', () => {
    const BOTTOM_SLAB = [[0, 0, 0, 1, 0.5, 1]] as const;
    const TOP_SLAB = [[0, 0.5, 0, 1, 1, 1]] as const;
    const WEST_HALF = [[0, 0, 0, 0.5, 1, 1]] as const;
    const EAST_HALF = [[0.5, 0, 0, 1, 1, 1]] as const;

    it("closes a bottom slab's floor, and leaves its open top and sides open", () => {
        expect(mergedFaceOccludes(BOTTOM_SLAB, [], 'down')).toBe(true);
        expect(mergedFaceOccludes(BOTTOM_SLAB, [], 'up')).toBe(false);
        expect(mergedFaceOccludes(BOTTOM_SLAB, [], 'east')).toBe(false);
    });

    it("counts the neighbor's boxes on the shared face too", () => {
        // A top slab below fills the face above it; a bottom slab below does not reach it.
        expect(mergedFaceOccludes([], TOP_SLAB, 'down')).toBe(true);
        expect(mergedFaceOccludes([], BOTTOM_SLAB, 'down')).toBe(false);
        expect(mergedFaceOccludes([], BOTTOM_SLAB, 'up')).toBe(true);
        // Two halves that together cover the face between two cells.
        expect(mergedFaceOccludes(WEST_HALF, [], 'west')).toBe(true);
        expect(mergedFaceOccludes(WEST_HALF, EAST_HALF, 'east')).toBe(false);
        expect(mergedFaceOccludes(EAST_HALF, WEST_HALF, 'east')).toBe(true);
    });

    it('leaves the face between two empty shapes open', () => {
        expect(mergedFaceOccludes([], [], 'north')).toBe(false);
    });
});
