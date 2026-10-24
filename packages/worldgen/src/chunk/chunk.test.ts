import { describe, expect, it } from 'vitest';

import { loadVanillaWorldgenData } from '../../vectors/javaWorldgenData';
import { vectors } from '../../vectors/vectors';
import type { DensitySampler } from '../density/compile';
import type { DensityFunctionNode } from '../density/DensityFunction';
import { SampleContext } from '../density/SampleContext';
import type { PositionalRandomFactory, RandomSource } from '../random/RandomSource';
import { XoroshiroRandomSource } from '../random/XoroshiroRandomSource';
import { RandomState } from '../RandomState';
import { ChunkSampler } from './ChunkSampler';
import { AIR, createGlobalFluidPicker, FluidStatus, LAVA, WATER } from './FluidPicker';
import { compileOreVeinRule, parseOreVeinRule } from './oreVein';

describe('FluidStatus', () => {
    it('fills everything strictly below its level', () => {
        const status = new FluidStatus(63, WATER);
        expect(status.at(62)).toBe(WATER);
        expect(status.at(63)).toBe(AIR);
        expect(status.at(64)).toBe(AIR);
    });

    it('compares by level and type', () => {
        expect(new FluidStatus(63, WATER).equals(new FluidStatus(63, WATER))).toBe(true);
        expect(new FluidStatus(63, WATER).equals(new FluidStatus(62, WATER))).toBe(false);
        expect(new FluidStatus(63, WATER).equals(new FluidStatus(63, LAVA))).toBe(false);
    });
});

describe('the global fluid picker', () => {
    const picker = createGlobalFluidPicker({
        noiseSettings: { minY: -64, height: 384 },
        defaultBlock: 'minecraft:stone',
        defaultFluid: WATER,
        noiseRouter: {} as never,
        materialRule: 'minecraft:overworld',
        seaLevel: 63,
        disableMobGeneration: false,
        aquifers: undefined,
        useLegacyRandomSource: false
    });

    it('fills to sea level with the dimension fluid', () => {
        expect(picker(0, 0, 0).at(62)).toBe(WATER);
        expect(picker(0, 0, 0).at(63)).toBe(AIR);
    });

    it('switches to lava below y -54', () => {
        expect(picker(0, -55, 0).at(-55)).toBe(LAVA);
        // At and above the threshold the sea status applies, which still reaches down here.
        expect(picker(0, -54, 0).at(-54)).toBe(WATER);
        expect(picker(0, 70, 0).at(70)).toBe(AIR);
    });
});

describe('the ore vein rule', () => {
    const rule = parseOreVeinRule(
        {
            type: 'minecraft:ore_vein',
            density: 'density',
            filler_block: 'minecraft:granite',
            filler_gap: 'gap',
            ore_block: 'minecraft:copper_ore',
            raw_ore_block: 'minecraft:raw_copper_block',
            raw_ore_chance: 0.02,
            richness: 'richness'
        },
        (reference) => ({ type: 'constant', value: 0 }) as DensityFunctionNode & { marker?: typeof reference }
    );

    const compileWith = (density: number, richness: number, gap: number, floats: number[]) => {
        const values: Record<string, number> = { density, richness, gap };
        const order = ['density', 'richness', 'gap'];
        let next = 0;
        const compile = (): DensitySampler => {
            const name = order[next++ % order.length] ?? 'density';
            return () => values[name] ?? 0;
        };
        let drawn = 0;
        const random: RandomSource = {
            nextFloat: () => floats[drawn++] ?? 0
        } as RandomSource;
        const factory: PositionalRandomFactory = { at: () => random } as PositionalRandomFactory;
        return { place: compileOreVeinRule(rule, compile, factory), draws: () => drawn };
    };

    it('places nothing where the vein density is not positive', () => {
        const { place, draws } = compileWith(0, 1, -1, []);
        expect(place(new SampleContext(), 0, 0, 0)).toBeUndefined();
        expect(draws()).toBe(0);
    });

    it('places nothing when the first draw is above the vein density', () => {
        const { place } = compileWith(0.5, 1, -1, [0.6]);
        expect(place(new SampleContext(), 0, 0, 0)).toBeUndefined();
    });

    it('places the ore block when the richness draw succeeds and the gap is negative', () => {
        const { place } = compileWith(0.5, 0.5, -1, [0.1, 0.1, 0.5]);
        expect(place(new SampleContext(), 0, 0, 0)).toBe('minecraft:copper_ore');
    });

    it('places the raw block on the two percent chance', () => {
        const { place } = compileWith(0.5, 0.5, -1, [0.1, 0.1, 0.01]);
        expect(place(new SampleContext(), 0, 0, 0)).toBe('minecraft:raw_copper_block');
    });

    it('places the filler block where the gap noise is not negative', () => {
        const { place } = compileWith(0.5, 0.5, 1, [0.1, 0.1]);
        expect(place(new SampleContext(), 0, 0, 0)).toBe('minecraft:granite');
    });

    it('rejects a rule with a missing block', () => {
        expect(() =>
            parseOreVeinRule({ ore_block: 'minecraft:copper_ore', raw_ore_chance: 0.02 }, () => ({
                type: 'constant',
                value: 0
            }))
        ).toThrow(TypeError);
    });
});

const vanilla = loadVanillaWorldgenData();
const chunkVectors = vectors.chunk;

/**
 * These run only with `JSP_WORLDGEN_VANILLA` set, because they read the pinned Java Edition
 * server jar, which a clean checkout does not have.
 */
describe.skipIf(!vanilla)('the overworld chunk sampler', () => {
    if (!vanilla) return;
    const data = vanilla.data;
    const settings = data.settings(chunkVectors.settings);
    const state = new RandomState(data, BigInt(chunkVectors.seed), settings);

    const sampler = new ChunkSampler(state, { chunkX: chunkVectors.chunkX, chunkZ: chunkVectors.chunkZ });

    it('covers the dimension height', () => {
        expect(sampler.volume.minBlockY).toBe(chunkVectors.minY);
        expect(sampler.volume.maxBlockY - sampler.volume.minBlockY + 1).toBe(chunkVectors.height);
    });

    it('produces the same block column as Java, aquifers included', { timeout: 120_000 }, () => {
        for (const expected of chunkVectors.columns) {
            const column = sampler.column(expected.x, expected.z);
            const runs: { y: number; count: number; block: string }[] = [];
            for (const [index, entry] of column.entries()) {
                const last = runs[runs.length - 1];
                if (last && last.block === entry.state) last.count++;
                else runs.push({ y: chunkVectors.minY + index, count: 1, block: entry.state });
            }
            expect({ x: expected.x, z: expected.z, runs }).toEqual({
                x: expected.x,
                z: expected.z,
                runs: expected.runs
            });
        }
    });

    it('gives the same chunk for the same seed across runs', { timeout: 120_000 }, () => {
        const second = new ChunkSampler(new RandomState(data, BigInt(chunkVectors.seed), settings), {
            chunkX: chunkVectors.chunkX,
            chunkZ: chunkVectors.chunkZ
        });
        const first = chunkVectors.columns[0];
        if (!first) throw new Error('The chunk vectors carry no columns');
        expect(second.column(first.x, first.z).map((entry) => entry.state)).toEqual(
            sampler.column(first.x, first.z).map((entry) => entry.state)
        );
    });

    it('fills all 256 columns of a chunk', { timeout: 600_000 }, () => {
        const grid = new ChunkSampler(state, { chunkX: 0, chunkZ: 0 }).fill();
        expect(grid).toHaveLength(16);
        expect(grid[0]).toHaveLength(16);
        expect(grid[0]?.[0]).toHaveLength(chunkVectors.height);
    });

    it('uses a positional random for the aquifer rather than call order', { timeout: 120_000 }, () => {
        // Sampling the same position twice through two samplers must agree, which it cannot
        // if the aquifer drew from a shared sequential stream.
        const other = new ChunkSampler(state, { chunkX: chunkVectors.chunkX, chunkZ: chunkVectors.chunkZ });
        const first = chunkVectors.columns[0];
        if (!first) throw new Error('The chunk vectors carry no columns');
        expect(other.column(first.x, first.z).map((entry) => entry.state)).toEqual(
            sampler.column(first.x, first.z).map((entry) => entry.state)
        );
        expect(XoroshiroRandomSource.fromSeed(1n).nextLong()).toBeTypeOf('bigint');
    });
});
