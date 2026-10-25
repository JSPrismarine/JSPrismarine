import { describe, expect, it } from 'vitest';

import { LAVA, WATER, falls, isWashedAway, liquidOf, needsSupport } from './BlockRules';

describe('needsSupport', () => {
    it('keeps the blocks the old hand-written list named', () => {
        for (const name of [
            'minecraft:short_grass',
            'minecraft:tall_grass',
            'minecraft:deadbush',
            'minecraft:dandelion',
            'minecraft:poppy',
            'minecraft:wheat',
            'minecraft:carrots',
            'minecraft:potatoes',
            'minecraft:beetroot',
            'minecraft:oak_sapling',
            'minecraft:torchflower',
            'minecraft:torchflower_crop',
            'minecraft:pitcher_crop',
            'minecraft:sweet_berry_bush',
            'minecraft:snow_layer',
            'minecraft:reeds',
            'minecraft:nether_wart',
            'minecraft:rail',
            'minecraft:golden_rail',
            'minecraft:redstone_wire',
            'minecraft:white_carpet',
            'minecraft:flower_pot'
        ]) {
            expect([name, needsSupport(name)]).toEqual([name, true]);
        }
    });

    it('covers the blocks no name list reached', () => {
        for (const name of [
            'minecraft:firefly_bush',
            'minecraft:open_eyeblossom',
            'minecraft:pale_moss_carpet',
            'minecraft:pink_petals',
            'minecraft:wildflowers',
            'minecraft:short_dry_grass',
            'minecraft:crimson_fungus',
            'minecraft:powder_snow',
            'minecraft:bamboo_sapling'
        ]) {
            expect([name, needsSupport(name)]).toEqual([name, true]);
        }
    });

    it('leaves alone what holds itself up', () => {
        for (const name of [
            'minecraft:stone',
            'minecraft:oak_leaves',
            'minecraft:dirt',
            'minecraft:wooden_door',
            'minecraft:white_shulker_box',
            'minecraft:cactus',
            'minecraft:chest'
        ]) {
            expect([name, needsSupport(name)]).toEqual([name, false]);
        }
    });

    it('leaves alone what hangs on a wall or floats', () => {
        // A liquid pops all of these too, and `BlockPhysics` only ever looks down - so a vine
        // column, a wall head and a coral fan would all break for want of a floor they never had.
        for (const name of [
            'minecraft:vine',
            'minecraft:torch',
            'minecraft:redstone_torch',
            'minecraft:soul_torch',
            'minecraft:skeleton_skull',
            'minecraft:player_head',
            'minecraft:tube_coral_wall_fan',
            'minecraft:kelp',
            'minecraft:seagrass',
            'minecraft:web',
            'minecraft:waterlily',
            'minecraft:fire',
            'minecraft:chorus_plant'
        ]) {
            expect([name, needsSupport(name)]).toEqual([name, false]);
        }
    });
});

describe('falls', () => {
    it('is the gravity families, not a second list', () => {
        for (const name of [
            'minecraft:sand',
            'minecraft:red_sand',
            'minecraft:gravel',
            'minecraft:anvil',
            'minecraft:chipped_anvil',
            'minecraft:white_concrete_powder',
            'minecraft:black_concrete_powder',
            // Neither of these was in the hand-written list.
            'minecraft:dragon_egg',
            'minecraft:suspicious_sand',
            'minecraft:suspicious_gravel'
        ]) {
            expect([name, falls(name)]).toEqual([name, true]);
        }

        expect(falls('minecraft:stone')).toBe(false);
        expect(falls('minecraft:sandstone')).toBe(false);
    });
});

describe('isWashedAway', () => {
    it('drowns a plant rather than damming a river behind it', () => {
        expect(isWashedAway('minecraft:wheat')).toBe(true);
        expect(isWashedAway('minecraft:torch')).toBe(true);
        expect(isWashedAway('minecraft:snow_layer')).toBe(true);
        expect(isWashedAway('minecraft:air')).toBe(true);
    });

    it('dams behind anything a liquid cannot move', () => {
        expect(isWashedAway('minecraft:stone')).toBe(false);
        expect(isWashedAway('minecraft:oak_fence')).toBe(false);
        expect(isWashedAway('minecraft:scaffolding')).toBe(false);
    });
});

describe('liquidOf', () => {
    it('reads both forms of each liquid as one substance', () => {
        expect(liquidOf('minecraft:water')).toBe(WATER);
        expect(liquidOf('minecraft:flowing_water')).toBe(WATER);
        expect(liquidOf('minecraft:lava')).toBe(LAVA);
        expect(liquidOf('minecraft:flowing_lava')).toBe(LAVA);
        expect(liquidOf('minecraft:stone')).toBeNull();
    });
});
