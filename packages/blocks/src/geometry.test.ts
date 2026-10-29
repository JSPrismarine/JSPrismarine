import { blockSchemas } from '@jsprismarine/minecraft/generated/block-schemas';
import { reportProgress } from '../../../.test/reportProgress';
import { describe, expect, it } from 'vitest';

import {
    BEDROCK_GEOMETRY_STATE_COUNT,
    FULL_BLOCK,
    PASSABLE,
    bedrockCollisionTopOf,
    bedrockLiquidReactionOf,
    isWashedAway
} from './geometry';

describe('bedrockCollisionTopOf', () => {
    it('covers every block the palette declares', () => {
        const missing = Object.keys(blockSchemas.blocks).filter(
            (identifier) => bedrockCollisionTopOf(identifier) === undefined
        );
        expect(missing).toEqual([]);
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
