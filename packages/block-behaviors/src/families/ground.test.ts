import { describe, expect, it } from 'vitest';

import { bindFamily } from '../harness';
import { AIR } from '../identifiers';
import { FALL_DELAY } from '../rules/gravity';
import { dripstoneFamily, iceFamily, MELT_LIGHT, snowFamily, soilFamily } from './ground';

const origin = { x: 0, y: 4, z: 0 };

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

    it('turns back to dirt when something lands on it', () => {
        const harness = bindFamily(soilFamily, 'minecraft:farmland');
        harness.dimension.set(origin, 'minecraft:farmland', { moisturized_amount: 7 });

        harness.fallOn(origin, 3);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:dirt');
    });
});

describe('soilFamily: grass', () => {
    it('spreads onto a lit dirt block and dies under a solid one', () => {
        const harness = bindFamily(soilFamily, 'minecraft:grass_block');
        harness.dimension.set(origin, 'minecraft:grass_block');
        harness.dimension.set({ x: 1, y: 4, z: 0 }, 'minecraft:dirt');
        harness.dimension.queueRandom(0.01);

        harness.randomTick(origin);

        expect(harness.dimension.identifierAt({ x: 1, y: 4, z: 0 })).toBe('minecraft:grass_block');

        harness.dimension.set({ x: 0, y: 5, z: 0 }, 'minecraft:stone');
        harness.randomTick(origin);

        expect(harness.dimension.identifierAt(origin)).toBe('minecraft:dirt');
    });
});

describe('iceFamily', () => {
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
