import { describe, expect, it } from 'vitest';

import { DropTable } from './DropTable';
import BirchLeaves from './blocks/BirchLeaves';
import DeadBush from './blocks/DeadBush';
import Grass from './blocks/Grass';
import Gravel from './blocks/Gravel';
import OakLeaves from './blocks/OakLeaves';
import TallGrass from './blocks/TallGrass';

/** A server with nothing but a source of chance and the two registries a drop may name. */
const serverRolling = (random: () => number): any => ({
    getRandom: () => random,
    getBlockManager: () => ({ getBlock: (name: string) => ({ getName: () => name }) }),
    getItemManager: () => ({ getItem: (name: string) => ({ getName: () => name }) })
});

/** Rolls a block many times and counts what fell, by name. */
const tally = (block: any, rolls: number): Record<string, number> => {
    const server = serverRolling(Math.random);
    const counts: Record<string, number> = {};

    for (let i = 0; i < rolls; i++) {
        for (const drop of block.getDropsForCompatibleTool(null, server)) {
            counts[drop.getName()] = (counts[drop.getName()] ?? 0) + 1;
        }
    }

    return counts;
};

const ROLLS = 40_000;

describe('DropTable', () => {
    it('takes its chance from where it is told, so a roll can be made to repeat', () => {
        // The point of the whole thing: gravel's flint was a `Math.random()` in the method
        // body, which is untestable however right the odds were.
        const always = new DropTable([{ name: 'minecraft:flint', oneIn: 10 }]).roll(() => 0);
        const never = new DropTable([{ name: 'minecraft:flint', oneIn: 10 }]).roll(() => 0.99);

        expect(always.map((drop) => drop.getName())).toEqual(['minecraft:flint']);
        expect(never).toHaveLength(0);
    });

    it('gives a fresh stack each time, never one object twice', () => {
        // Two entities sharing an item are two entities that mutate each other.
        const drops = new DropTable([{ name: 'minecraft:stick', min: 3, max: 3 }]).roll(() => 0);

        expect(drops).toHaveLength(3);
        expect(drops[0]).not.toBe(drops[1]);
    });

    it('names a drop the item table can resolve, without a numeric id', () => {
        const [seed] = new DropTable([{ name: 'minecraft:wheat_seeds' }]).roll(() => 0);

        expect(seed!.getNetworkId()).toBeGreaterThan(0);
    });
});

describe('vanilla drops', () => {
    it('turns a grass block into plain dirt', () => {
        expect(tally(new Grass(), 1)).toEqual({ 'minecraft:dirt': 1 });
    });

    it('gives seeds from tall grass one time in eight', () => {
        const seeds = tally(new TallGrass(), ROLLS)['minecraft:wheat_seeds'] ?? 0;

        expect(seeds / ROLLS).toBeCloseTo(1 / 8, 1);
    });

    it('gives flint from gravel one time in ten, and gravel the rest', () => {
        const counts = tally(new Gravel(), ROLLS);

        expect((counts['minecraft:flint'] ?? 0) / ROLLS).toBeCloseTo(1 / 10, 1);
        expect((counts['minecraft:gravel'] ?? 0) / ROLLS).toBeCloseTo(9 / 10, 1);
    });

    it('gives nought to two sticks from a dead bush, one on average', () => {
        expect((tally(new DeadBush(), ROLLS)['minecraft:stick'] ?? 0) / ROLLS).toBeCloseTo(1, 1);
    });

    it('gives a sapling of its own wood, and apples only from the oaks', () => {
        const oak = tally(new OakLeaves(), ROLLS);
        const birch = tally(new BirchLeaves(), ROLLS);

        expect((oak['minecraft:oak_sapling'] ?? 0) / ROLLS).toBeCloseTo(1 / 20, 1);
        expect((oak['minecraft:apple'] ?? 0) / ROLLS).toBeCloseTo(1 / 200, 1);

        // Derived from the block's own name, so a birch cannot yield an oak sapling however
        // the subclasses are written - and a birch bears no fruit.
        expect(birch['minecraft:oak_sapling']).toBeUndefined();
        expect(birch['minecraft:apple']).toBeUndefined();
        expect((birch['minecraft:birch_sapling'] ?? 0) / ROLLS).toBeCloseTo(1 / 20, 1);
    });
});
