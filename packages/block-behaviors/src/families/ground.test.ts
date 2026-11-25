import { describe, expect, it } from 'vitest';

import { bindFamily, heldItem, silkTouchTool } from '../harness';
import { AIR } from '../identifiers';
import { FALL_DELAY } from '../rules/gravity';
import { createVoxelWorld } from '../voxelWorld';
import {
    concretePowderFamily,
    dripstoneFamily,
    iceFamily,
    MAINTAINS_FARMLAND_TAG,
    MELT_LIGHT,
    snowFamily,
    soilFamily
} from './ground';

const origin = { x: 0, y: 4, z: 0 };

describe('soilFamily: pale hanging moss', () => {
    it('hangs from more moss or a block above, and pops with neither', () => {
        const harness = bindFamily(soilFamily, 'minecraft:pale_hanging_moss');
        const moss = { x: 0, y: 1, z: 0 };
        harness.dimension.set({ x: 0, y: 2, z: 0 }, 'minecraft:pale_hanging_moss');
        harness.dimension.set(moss, 'minecraft:pale_hanging_moss', { tip: true });

        harness.neighborChanged(moss, 'up');
        expect(harness.dimension.identifierAt(moss)).toBe('minecraft:pale_hanging_moss');

        harness.dimension.set({ x: 0, y: 2, z: 0 }, 'minecraft:air');
        harness.neighborChanged(moss, 'up');
        expect(harness.dimension.identifierAt(moss)).toBe('minecraft:air');
    });
});

describe('soilFamily: gravity', () => {
    it('falls through air block by block and lands on stone', () => {
        const harness = bindFamily(soilFamily, 'minecraft:sand');
        harness.dimension.set({ x: 0, y: 0, z: 0 }, 'minecraft:stone');
        harness.dimension.set(origin, 'minecraft:sand');

        harness.place(origin);

        expect(harness.dimension.scheduled).toEqual([{ position: origin, delay: FALL_DELAY }]);

        harness.tick(origin);

        expect(harness.dimension.identifierAt({ x: 0, y: 3, z: 0 })).toBe('minecraft:sand');
        expect(harness.dimension.identifierAt(origin)).toBe(AIR);

        harness.tick({ x: 0, y: 3, z: 0 });
        harness.tick({ x: 0, y: 2, z: 0 });
        harness.tick({ x: 0, y: 1, z: 0 });

        expect(harness.dimension.identifierAt({ x: 0, y: 1, z: 0 })).toBe('minecraft:sand');
    });

    it('does not fall when something holds it up', () => {
        const harness = bindFamily(soilFamily, 'minecraft:gravel');
        harness.dimension.set({ x: 0, y: 3, z: 0 }, 'minecraft:stone');
        harness.dimension.set(origin, 'minecraft:gravel');

        harness.neighborChanged(origin, 'down');

        expect(harness.dimension.scheduled).toEqual([]);
    });

    it('leaves a block that does not fall alone', () => {
        const harness = bindFamily(soilFamily, 'minecraft:dirt');
        harness.dimension.set(origin, 'minecraft:dirt');

        harness.place(origin);

        expect(harness.dimension.scheduled).toEqual([]);
    });
});

describe('concretePowderFamily', () => {
    const powder = 'minecraft:white_concrete_powder';

    it('sets into concrete when water is beside it', () => {
        const harness = bindFamily(concretePowderFamily, powder);
        harness.dimension.set({ x: 0, y: 3, z: 0 }, 'minecraft:stone');
        harness.dimension.set({ x: 1, y: 4, z: 0 }, 'minecraft:water');
        harness.dimension.set(origin, powder);

        harness.place(origin);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:white_concrete');
    });

    it('does not set into concrete for water only below it', () => {
        const harness = bindFamily(concretePowderFamily, powder);
        harness.dimension.set({ x: 0, y: 3, z: 0 }, 'minecraft:water');
        harness.dimension.set(origin, powder);

        harness.neighborChanged(origin, 'east');

        expect(harness.dimension.identifierAt(origin)).toBe(powder);
    });

    it('falls like sand when dry', () => {
        const harness = bindFamily(concretePowderFamily, powder);
        harness.dimension.set(origin, powder);

        harness.place(origin);

        expect(harness.dimension.scheduled).toEqual([{ position: origin, delay: FALL_DELAY }]);
    });

    it('sets into concrete when it falls into water', () => {
        const harness = bindFamily(concretePowderFamily, powder);
        harness.dimension.set({ x: 0, y: 3, z: 0 }, 'minecraft:water');
        harness.dimension.set(origin, powder);

        harness.tick(origin);

        expect(harness.dimension.identifierAt({ x: 0, y: 3, z: 0 })).toBe('minecraft:white_concrete');
        expect(harness.dimension.identifierAt(origin)).toBe(AIR);
    });
});

describe('soilFamily: farmland', () => {
    it('stays moist next to water and dries out without it', () => {
        const harness = bindFamily(soilFamily, 'minecraft:farmland');
        harness.dimension.set(origin, 'minecraft:farmland', { moisturized_amount: 0 });
        harness.dimension.set({ x: 2, y: 4, z: 0 }, 'minecraft:water');

        harness.randomTick(origin);

        expect(harness.dimension.stateAt(origin, 'moisturized_amount')).toBe(7);

        harness.dimension.set({ x: 2, y: 4, z: 0 }, AIR);
        harness.randomTick(origin);

        expect(harness.dimension.stateAt(origin, 'moisturized_amount')).toBe(6);
    });

    /**
     * Java's `shouldMaintainFarmland` reads `#minecraft:maintains_farmland`, and the tag is
     * not the set of things that grow: a torchflower holds the field with no growth of its
     * own, and a sweet berry bush grows and does not hold it.
     */
    describe('drying all the way out', () => {
        const dryFarmlandUnder = (planted?: { identifier: string; states?: Record<string, string | number> }) => {
            const world = createVoxelWorld();
            world.overworld.tag(MAINTAINS_FARMLAND_TAG, 'minecraft:wheat', 'minecraft:torchflower');
            const harness = bindFamily(soilFamily, 'minecraft:farmland', { world });
            harness.dimension.set(origin, 'minecraft:farmland', { moisturized_amount: 0 });
            if (planted !== undefined) {
                harness.dimension.set({ x: 0, y: 5, z: 0 }, planted.identifier, planted.states ?? {});
            }

            harness.randomTick(origin);
            return harness.dimension.identifierAt(origin);
        };

        it('keeps the field under a block the tag names', () => {
            expect(dryFarmlandUnder({ identifier: 'minecraft:wheat', states: { growth: 3 } })).toBe(
                'minecraft:farmland'
            );
        });

        it('keeps the field under a tagged block that does not grow', () => {
            expect(dryFarmlandUnder({ identifier: 'minecraft:torchflower' })).toBe('minecraft:farmland');
        });

        it('gives up the field under a growing block the tag leaves out', () => {
            expect(dryFarmlandUnder({ identifier: 'minecraft:sweet_berry_bush', states: { growth: 2 } })).toBe(
                'minecraft:dirt'
            );
        });

        it('gives up bare farmland', () => {
            expect(dryFarmlandUnder()).toBe('minecraft:dirt');
        });

        it('keeps a crop on a host that answers no tags at all', () => {
            const harness = bindFamily(soilFamily, 'minecraft:farmland');
            harness.dimension.set(origin, 'minecraft:farmland', { moisturized_amount: 0 });
            harness.dimension.set({ x: 0, y: 5, z: 0 }, 'minecraft:wheat', { growth: 3 });

            harness.randomTick(origin);

            expect(harness.dimension.identifierAt(origin)).toBe('minecraft:farmland');
        });
    });

    it('turns back to dirt when something lands on it', () => {
        const harness = bindFamily(soilFamily, 'minecraft:farmland');
        harness.dimension.set(origin, 'minecraft:farmland', { moisturized_amount: 7 });

        harness.fallOn(origin, 3);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:dirt');
    });
});

describe('soilFamily: grass', () => {
    /** Java's three `nextInt` draws of one spread attempt, for an offset across, down and along z. */
    const attempt = (dx: -1 | 0 | 1, dy: -3 | -2 | -1 | 0 | 1, dz: -1 | 0 | 1): number[] => [
        (dx + 1.5) / 3,
        (dy + 3.5) / 5,
        (dz + 1.5) / 3
    ];

    it('spreads onto lit dirt diagonally below it, where no face neighbor is dirt', () => {
        const harness = bindFamily(soilFamily, 'minecraft:grass_block');
        const target = { x: origin.x + 1, y: origin.y - 1, z: origin.z + 1 };
        harness.dimension.set(origin, 'minecraft:grass_block');
        harness.dimension.set(target, 'minecraft:dirt');
        harness.dimension.setLight({ ...origin, y: origin.y + 1 }, 15);
        harness.dimension.queueRandom(
            ...attempt(1, -1, 1),
            ...attempt(0, 1, 0),
            ...attempt(0, 1, 0),
            ...attempt(0, 1, 0)
        );

        harness.randomTick(origin);

        expect(harness.dimension.identifierAt(target)).toBe('minecraft:grass_block');
    });

    it('spreads nothing below light 9, and onto no dirt under water', () => {
        const harness = bindFamily(soilFamily, 'minecraft:mycelium');
        const target = { x: origin.x + 1, y: origin.y, z: origin.z };
        harness.dimension.set(origin, 'minecraft:mycelium');
        harness.dimension.set(target, 'minecraft:dirt');
        harness.dimension.setLight({ ...origin, y: origin.y + 1 }, 8);
        harness.dimension.queueRandom(...attempt(1, 0, 0));
        harness.randomTick(origin);
        expect(harness.dimension.identifierAt(target)).toBe('minecraft:dirt');

        harness.dimension.setLight({ ...origin, y: origin.y + 1 }, 15);
        harness.dimension.set({ ...target, y: target.y + 1 }, 'minecraft:flowing_water', { liquid_depth: 3 });
        harness.dimension.queueRandom(...[0, 1, 2, 3].flatMap(() => attempt(1, 0, 0)));
        harness.randomTick(origin);
        expect(harness.dimension.identifierAt(target)).toBe('minecraft:dirt');
    });

    it('dies under a waterlogged block and lives under a dry one, and spreads under neither wet', () => {
        const harness = bindFamily(soilFamily, 'minecraft:grass_block');
        const above = { ...origin, y: origin.y + 1 };
        // A fence lets light through, as its block properties say.
        harness.dimension.defineLightDampening('minecraft:oak_fence', 0);
        harness.dimension.set(origin, 'minecraft:grass_block');
        harness.dimension.set(above, 'minecraft:oak_fence');
        harness.dimension.setLight(above, 0);
        harness.randomTick(origin);
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:grass_block');

        harness.dimension.setLiquid(above, 'minecraft:water', { liquid_depth: 0 });
        harness.randomTick(origin);
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:dirt');

        const target = { x: origin.x + 1, y: origin.y, z: origin.z };
        const spreading = bindFamily(soilFamily, 'minecraft:grass_block');
        spreading.dimension.defineLightDampening('minecraft:oak_fence', 0);
        spreading.dimension.set(origin, 'minecraft:grass_block');
        spreading.dimension.set(target, 'minecraft:dirt');
        spreading.dimension.set({ ...target, y: target.y + 1 }, 'minecraft:oak_fence');
        spreading.dimension.setLiquid({ ...target, y: target.y + 1 }, 'minecraft:flowing_water', { liquid_depth: 2 });
        spreading.dimension.setLight({ ...origin, y: origin.y + 1 }, 15);
        spreading.dimension.queueRandom(...[0, 1, 2, 3].flatMap(() => attempt(1, 0, 0)));
        spreading.randomTick(origin);
        expect(spreading.dimension.identifierAt(target)).toBe('minecraft:dirt');
    });

    it('dies under an opaque block and a water source, and lives under a single snow layer', () => {
        const harness = bindFamily(soilFamily, 'minecraft:grass_block');
        const above = { ...origin, y: origin.y + 1 };
        harness.dimension.set(origin, 'minecraft:grass_block');
        harness.dimension.set(above, 'minecraft:snow_layer', { height: 0 });
        harness.dimension.setLight(above, 0);
        harness.randomTick(origin);
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:grass_block');

        harness.dimension.set(above, 'minecraft:water', { liquid_depth: 0 });
        harness.randomTick(origin);
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:dirt');

        harness.dimension.set(origin, 'minecraft:grass_block');
        harness.dimension.set(above, 'minecraft:stone');
        harness.randomTick(origin);
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:dirt');
    });
});

describe('iceFamily', () => {
    it('leaves water behind for a plain tool and comes away whole to silk touch', () => {
        const harness = bindFamily(iceFamily, 'minecraft:ice');
        harness.dimension.set(origin, 'minecraft:ice');

        harness.breakBlock(origin, { itemStack: heldItem('minecraft:diamond_pickaxe') });

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:water');
        expect(harness.dimension.drops).toEqual([]);

        harness.dimension.set(origin, 'minecraft:packed_ice');
        harness.breakBlock(origin, { itemStack: silkTouchTool() });

        expect(harness.dimension.drops.map((entry) => entry.drop)).toEqual([
            { identifier: 'minecraft:packed_ice', count: 1 }
        ]);
    });

    it('melts to water in the light and keeps packed ice solid', () => {
        const harness = bindFamily(iceFamily, 'minecraft:ice');
        harness.dimension.set(origin, 'minecraft:ice');

        harness.randomTick(origin);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:water');

        const packed = bindFamily(iceFamily, 'minecraft:packed_ice');
        packed.dimension.set(origin, 'minecraft:packed_ice');
        packed.randomTick(origin);

        expect(packed.dimension.identifierAt(origin)).toBe('minecraft:packed_ice');
    });

    it('stays frozen in the dark', () => {
        const harness = bindFamily(iceFamily, 'minecraft:ice');
        harness.dimension.set(origin, 'minecraft:ice');
        harness.dimension.setLight({ x: 0, y: 5, z: 0 }, MELT_LIGHT - 1);

        harness.randomTick(origin);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:ice');
    });

    it('ages frosted ice through its four stages before it melts', () => {
        const harness = bindFamily(iceFamily, 'minecraft:frosted_ice');
        harness.dimension.set(origin, 'minecraft:frosted_ice', { age: 0 });

        harness.randomTicks(origin, 3);

        expect(harness.dimension.stateAt(origin, 'age')).toBe(3);

        harness.randomTick(origin);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:water');
    });
});

describe('snowFamily', () => {
    it('drops one snowball per layer', () => {
        const harness = bindFamily(snowFamily, 'minecraft:snow_layer');
        harness.dimension.set(origin, 'minecraft:snow_layer', { height: 3, covered_bit: false });

        harness.breakBlock(origin);

        expect(harness.dimension.drops.map((entry) => entry.drop)).toEqual([
            { identifier: 'minecraft:snowball', count: 4 }
        ]);
    });

    it('melts in the light', () => {
        const harness = bindFamily(snowFamily, 'minecraft:snow_layer');
        harness.dimension.set(origin, 'minecraft:snow_layer', { height: 0, covered_bit: false });

        harness.randomTick(origin);

        expect(harness.dimension.identifierAt(origin)).toBe(AIR);
    });
});

describe('dripstoneFamily', () => {
    const dripstone = 'minecraft:pointed_dripstone';
    const above = { x: 0, y: 5, z: 0 };
    const below = { x: 0, y: 3, z: 0 };

    it('keeps a stalagmite standing on the block below it', () => {
        const harness = bindFamily(dripstoneFamily, dripstone);
        harness.dimension.set(below, 'minecraft:dripstone_block');
        harness.dimension.set(origin, dripstone, { dripstone_thickness: 'tip', hanging: false });

        harness.neighborChanged(origin, 'up');

        expect(harness.dimension.identifierAt(origin)).toBe(dripstone);
        expect(harness.dimension.drops).toEqual([]);
    });

    it('keeps a stalactite hanging from a stalactite above it', () => {
        const harness = bindFamily(dripstoneFamily, dripstone);
        harness.dimension.set(above, dripstone, { dripstone_thickness: 'base', hanging: true });
        harness.dimension.set(origin, dripstone, { dripstone_thickness: 'tip', hanging: true });

        harness.neighborChanged(origin, 'up');

        expect(harness.dimension.identifierAt(origin)).toBe(dripstone);
    });

    it('pops a stalagmite whose ground is gone', () => {
        const harness = bindFamily(dripstoneFamily, dripstone);
        harness.dimension.set(above, 'minecraft:dripstone_block');
        harness.dimension.set(origin, dripstone, { dripstone_thickness: 'tip', hanging: false });

        harness.neighborChanged(origin, 'down');

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:air');
    });

    const lookingUp = { identifier: 'minecraft:player', position: { x: 0, y: 0, z: 0 }, pitch: -60 };
    const lookingDown = { ...lookingUp, pitch: 60 };
    const segment = (harness: ReturnType<typeof bindFamily>, y: number) => {
        const block = harness.block({ x: 0, y, z: 0 });
        return { identifier: block.identifier, ...block.states };
    };

    it('stands on the floor for a placer looking down and hangs from the ceiling for one looking up', () => {
        const floor = bindFamily(dripstoneFamily, dripstone);
        floor.dimension.set(below, 'minecraft:stone');
        floor.dimension.set(origin, dripstone, { dripstone_thickness: 'tip', hanging: true });
        floor.place(origin, { placedBy: lookingDown, face: 'up' });
        expect(floor.block(origin).states).toMatchObject({ hanging: false, dripstone_thickness: 'tip' });

        const ceiling = bindFamily(dripstoneFamily, dripstone);
        ceiling.dimension.set(above, 'minecraft:stone');
        ceiling.dimension.set(origin, dripstone, { dripstone_thickness: 'tip', hanging: false });
        ceiling.place(origin, { placedBy: lookingUp, face: 'down' });
        expect(ceiling.block(origin).states).toMatchObject({ hanging: true, dripstone_thickness: 'tip' });
    });

    it('stands on the only support there is for a placer whose pitch is unknown', () => {
        const harness = bindFamily(dripstoneFamily, dripstone);
        harness.dimension.set(below, 'minecraft:stone');
        harness.dimension.set(origin, dripstone, { dripstone_thickness: 'tip', hanging: true });

        harness.place(origin, { placedBy: { identifier: 'minecraft:player', position: origin }, face: 'up' });

        expect(harness.block(origin).states).toMatchObject({ hanging: false });
    });

    it('points the other way when only that way has support', () => {
        const harness = bindFamily(dripstoneFamily, dripstone);
        harness.dimension.set(above, 'minecraft:stone');
        harness.dimension.set(origin, dripstone, { dripstone_thickness: 'tip', hanging: false });

        harness.place(origin, { placedBy: lookingDown, face: 'north' });

        expect(harness.block(origin).states).toMatchObject({ hanging: true });
    });

    it('refuses a placement with nothing above or below to hold it', () => {
        const harness = bindFamily(dripstoneFamily, dripstone);
        harness.dimension.set(origin, dripstone, { dripstone_thickness: 'tip', hanging: true });
        expect(harness.beforePlace(origin, 'north', lookingDown)).toBe(true);

        harness.dimension.set(above, 'minecraft:stone');
        expect(harness.beforePlace(origin, 'down', lookingUp)).toBe(false);
    });

    it('thickens a column from base to tip as segments join it', () => {
        const harness = bindFamily(dripstoneFamily, dripstone);
        harness.dimension.set({ x: 0, y: 7, z: 0 }, 'minecraft:stone');
        for (const y of [6, 5, 4, 3]) {
            harness.dimension.set({ x: 0, y, z: 0 }, dripstone, { dripstone_thickness: 'tip', hanging: true });
        }

        for (const y of [3, 4, 5, 6]) harness.neighborChanged({ x: 0, y, z: 0 }, 'down');

        expect([6, 5, 4, 3].map((y) => harness.block({ x: 0, y, z: 0 }).states['dripstone_thickness'])).toEqual([
            'base',
            'middle',
            'frustum',
            'tip'
        ]);
    });

    it('merges a placed stalactite with the stalagmite tip it meets', () => {
        const harness = bindFamily(dripstoneFamily, dripstone);
        harness.dimension.set(above, 'minecraft:stone');
        harness.dimension.set({ x: 0, y: 2, z: 0 }, 'minecraft:stone');
        harness.dimension.set(below, dripstone, { dripstone_thickness: 'tip', hanging: false });
        harness.dimension.set(origin, dripstone, { dripstone_thickness: 'tip', hanging: false });

        harness.place(origin, { placedBy: lookingUp, face: 'down' });
        harness.neighborChanged(below, 'up');

        expect(segment(harness, 4)).toMatchObject({ hanging: true, dripstone_thickness: 'merge' });
        expect(segment(harness, 3)).toMatchObject({ hanging: false, dripstone_thickness: 'merge' });
    });

    it('ignores a change beside a segment', () => {
        const harness = bindFamily(dripstoneFamily, dripstone);
        harness.dimension.set(origin, dripstone, { dripstone_thickness: 'tip', hanging: true });

        harness.neighborChanged(origin, 'north');

        expect(harness.dimension.identifierAt(origin)).toBe(dripstone);
        expect(harness.dimension.scheduled).toEqual([]);
    });

    it('drops a stalactite whose ceiling is gone, with the column hanging from it, until it lands', () => {
        const harness = bindFamily(dripstoneFamily, dripstone);
        const top = { x: 0, y: 6, z: 0 };
        harness.dimension.set({ x: 0, y: 1, z: 0 }, 'minecraft:stone');
        harness.dimension.set(top, dripstone, { dripstone_thickness: 'base', hanging: true });
        harness.dimension.set(above, dripstone, { dripstone_thickness: 'tip', hanging: true });

        harness.neighborChanged(top, 'up');
        expect(harness.dimension.scheduled).toEqual([{ position: top, delay: FALL_DELAY }]);
        expect(harness.dimension.identifierAt(top)).toBe(dripstone);
        expect(harness.dimension.drops).toEqual([]);

        harness.tick(top);
        expect(harness.dimension.identifierAt(top)).toBe(AIR);
        expect(segment(harness, 5)).toMatchObject({ dripstone_thickness: 'base', hanging: true });
        expect(segment(harness, 4)).toMatchObject({ dripstone_thickness: 'tip', hanging: true });

        for (const y of [5, 4, 3]) harness.tick({ x: 0, y, z: 0 });

        expect(harness.dimension.identifierAt({ x: 0, y: 3, z: 0 })).toBe(AIR);
        expect(harness.dimension.identifierAt({ x: 0, y: 2, z: 0 })).toBe(AIR);
        expect(harness.dimension.drops.map(({ drop }) => drop)).toEqual([
            { identifier: dripstone, count: 1 },
            { identifier: dripstone, count: 1 }
        ]);
    });

    it('drops a stalactite whose segment above was broken', () => {
        const harness = bindFamily(dripstoneFamily, dripstone);
        harness.dimension.set({ x: 0, y: 6, z: 0 }, 'minecraft:stone');
        harness.dimension.set(origin, dripstone, { dripstone_thickness: 'tip', hanging: true });

        harness.neighborChanged(origin, 'up');

        expect(harness.dimension.scheduled).toEqual([{ position: origin, delay: FALL_DELAY }]);
        expect(harness.dimension.drops).toEqual([]);
    });

    it('keeps a stalactite whose support came back before its tick', () => {
        const harness = bindFamily(dripstoneFamily, dripstone);
        harness.dimension.set(above, 'minecraft:stone');
        harness.dimension.set(origin, dripstone, { dripstone_thickness: 'tip', hanging: true });

        harness.tick(origin);

        expect(harness.dimension.identifierAt(origin)).toBe(dripstone);
    });

    it('pops a sulfur spike whose ground is gone, as Java does for pointed dripstone', () => {
        const harness = bindFamily(dripstoneFamily, 'minecraft:sulfur_spike');
        harness.dimension.set(below, 'minecraft:stone');
        harness.dimension.set(origin, 'minecraft:sulfur_spike', { dripstone_thickness: 'tip', hanging: false });

        harness.neighborChanged(origin, 'down');
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:sulfur_spike');

        harness.dimension.set(below, 'minecraft:air');
        harness.neighborChanged(origin, 'down');
        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:air');
    });

    it('grows a bud on a free face of a budding block', () => {
        const harness = bindFamily(dripstoneFamily, 'minecraft:budding_amethyst');
        harness.dimension.set(origin, 'minecraft:budding_amethyst');
        harness.dimension.queueRandom(0.01);

        harness.randomTick(origin);

        expect(harness.dimension.identifierAt({ x: 0, y: 3, z: 0 })).toBe('minecraft:small_amethyst_bud');
        expect(harness.dimension.stateAt({ x: 0, y: 3, z: 0 }, 'minecraft:block_face')).toBe('down');
    });

    it('advances a bud to the next stage', () => {
        const harness = bindFamily(dripstoneFamily, 'minecraft:medium_amethyst_bud');
        harness.dimension.set(origin, 'minecraft:medium_amethyst_bud', { 'minecraft:block_face': 'up' });
        harness.dimension.queueRandom(0.01);

        harness.randomTick(origin);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:large_amethyst_bud');
    });

    it('drops four shards from a cluster', () => {
        const harness = bindFamily(dripstoneFamily, 'minecraft:amethyst_cluster');
        harness.dimension.set(origin, 'minecraft:amethyst_cluster', { 'minecraft:block_face': 'up' });

        harness.breakBlock(origin);

        expect(harness.dimension.drops.map((entry) => entry.drop)).toEqual([
            { identifier: 'minecraft:amethyst_shard', count: 4 }
        ]);
    });
});
