import { describe, expect, it } from 'vitest';

import { loadVanillaWorldgenData } from '../../vectors/javaWorldgenData';
import { vectors } from '../../vectors/vectors';
import type { DensitySampler } from '../density/compile';
import type { DensityFunctionNode } from '../density/DensityFunction';
import { SampleContext } from '../density/SampleContext';
import { LegacyRandomSource } from '../random/LegacyRandomSource';
import type { PositionalRandomFactory, RandomSource } from '../random/RandomSource';
import { RandomState } from '../RandomState';
import type { NoiseGeneratorSettings, NoiseRouter } from '../settings/NoiseGeneratorSettings';
import { WorldgenData } from '../WorldgenData';
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

describe('column visitation', () => {
    it('matches column output while visiting top down without requiring result objects', () => {
        const router = {
            temperature: 0,
            vegetation: 0,
            continents: 0,
            erosion: 0,
            depth: 0,
            ridges: 0,
            chunk_surface_level: 0,
            final_density: 1
        };
        const data = new WorldgenData({
            densityFunctions: new Map(),
            noises: new Map(),
            noiseSettings: new Map([
                [
                    'test:flat',
                    {
                        noise: { min_y: 0, height: 16 },
                        default_block: 'minecraft:stone',
                        default_fluid: 'minecraft:water',
                        noise_router: router,
                        material_rule: 'test:surface',
                        sea_level: 8,
                        disable_mob_generation: true,
                        legacy_random_source: true
                    }
                ]
            ])
        });
        const sampler = new ChunkSampler(new RandomState(data, 1n, data.settings('test:flat')), {
            chunkX: 0,
            chunkZ: 0
        });
        const visited: { y: number; state: string; scheduleFluidUpdate: boolean }[] = [];

        sampler.forEachColumnBlock(0, 0, (y, state, scheduleFluidUpdate) => {
            visited.push({ y, state, scheduleFluidUpdate });
        });

        expect(visited.map(({ y }) => y)).toEqual(Array.from({ length: 16 }, (_, index) => 15 - index));
        expect(
            visited
                .slice()
                .reverse()
                .map(({ state, scheduleFluidUpdate }) => ({ state, scheduleFluidUpdate }))
        ).toEqual(sampler.column(0, 0));
    });
});

describe('the global fluid picker', () => {
    const zero: DensityFunctionNode = { type: 'constant', value: 0 };
    const router: NoiseRouter = {
        temperature: zero,
        vegetation: zero,
        continents: zero,
        erosion: zero,
        depth: zero,
        ridges: zero,
        chunkSurfaceLevel: zero,
        finalDensity: zero
    };
    const settings: NoiseGeneratorSettings = {
        noiseSettings: { minY: -64, height: 384 },
        defaultBlock: 'minecraft:stone',
        defaultFluid: WATER,
        noiseRouter: router,
        materialRule: 'minecraft:overworld',
        seaLevel: 63,
        disableMobGeneration: false,
        aquifers: undefined,
        useLegacyRandomSource: false
    };
    const picker = createGlobalFluidPicker(settings);

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
        (): DensityFunctionNode => ({ type: 'constant', value: 0 })
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
        // Only `nextFloat` is reachable from the rule; the rest delegates to a real source so
        // the double still satisfies the whole interface.
        const delegate = new LegacyRandomSource(0n);
        const random: RandomSource = {
            nextFloat: () => floats[drawn++] ?? 0,
            nextInt: () => delegate.nextInt(),
            nextIntBounded: (bound) => delegate.nextIntBounded(bound),
            nextLong: () => delegate.nextLong(),
            nextBoolean: () => delegate.nextBoolean(),
            nextDouble: () => delegate.nextDouble(),
            nextGaussian: () => delegate.nextGaussian(),
            consumeCount: (rounds) => delegate.consumeCount(rounds),
            fork: () => delegate.fork(),
            forkPositional: () => delegate.forkPositional()
        };
        const factory: PositionalRandomFactory = {
            at: () => random,
            fromHashOf: () => random,
            fromSeed: () => random
        };
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

            const stateOnly = new ChunkSampler(state, { chunkX: chunkVectors.chunkX, chunkZ: chunkVectors.chunkZ });
            const sampledFromTop: string[] = [];
            stateOnly.forEachColumnBlock(expected.x, expected.z, (_y, state) => sampledFromTop.push(state));
            expect(sampledFromTop.reverse()).toEqual(column.map((entry) => entry.state));
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
    });
});
