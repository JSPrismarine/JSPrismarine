import { describe, expect, it } from 'vitest';

import registryVectors from '../../vectors/surface-registries.json' with { type: 'json' };
import { DensityFunctionCompiler } from '../density/compile';
import type { DensityFunctionNode } from '../density/DensityFunction';
import { densityInputsOf } from '../density/DensityFunction';
import { RandomState } from '../RandomState';
import type { NoiseRouter } from '../settings/NoiseGeneratorSettings';
import { WorldgenData } from '../WorldgenData';
import { ChunkSampler } from './ChunkSampler';

const parseDocuments = (source: Record<string, string>): Map<string, unknown> =>
    new Map(Object.entries(source).map(([id, document]) => [id, JSON.parse(document) as unknown]));

const data = new WorldgenData({
    densityFunctions: parseDocuments(registryVectors.densityFunctions),
    noises: parseDocuments(registryVectors.noises),
    noiseSettings: parseDocuments(registryVectors.noiseSettings)
});

const SEED = 1234n;

/** A 4 by 8 by 4 cell over the overworld's 384 blocks: 4 * 48 * 4 cells in a chunk. */
const OVERWORLD_CELLS = 768;

const routerSlots = (router: NoiseRouter): DensityFunctionNode[] => Object.values(router);

describe('the interpolation cell a chunk is walked in', () => {
    it('is the cell of final density, 768 cells in the overworld', () => {
        const state = new RandomState(data, SEED, data.settings('minecraft:overworld'));

        const sampler = new ChunkSampler(state, { chunkX: 3, chunkZ: -5 });

        expect(state.interpolationCellSizeOf(state.settings.noiseRouter.finalDensity)).toEqual({ xz: 4, y: 8 });
        expect(sampler.cellCount).toBe(OVERWORLD_CELLS);
    });

    it('stays 768 cells after the surface pass compiles chunk_surface_level', () => {
        const state = new RandomState(data, SEED, data.settings('minecraft:overworld'));
        const router = state.settings.noiseRouter;
        expect(new ChunkSampler(state, { chunkX: 3, chunkZ: -5 }).cellCount).toBe(OVERWORLD_CELLS);

        // The surface pass samples this on the same state, and its cell is 16 by 1.
        state.sampler(router.chunkSurfaceLevel);

        // The compiler-wide hint has shrunk to 4 by 1, which is 6144 cells a chunk. That is the
        // regression this guards: a sampler that read it walked eight times the cells.
        expect(state.interpolationCellSize).toEqual({ xz: 4, y: 1 });
        expect(state.interpolationCellSizeOf(router.chunkSurfaceLevel)).toEqual({ xz: 16, y: 1 });
        expect(new ChunkSampler(state, { chunkX: 5, chunkZ: -8 }).cellCount).toBe(OVERWORLD_CELLS);
    });

    it('stays 768 cells after every router slot has compiled, in any order', () => {
        const state = new RandomState(data, SEED, data.settings('minecraft:overworld'));
        for (const slot of routerSlots(state.settings.noiseRouter).reverse()) state.sampler(slot);

        expect(new ChunkSampler(state, { chunkX: 3, chunkZ: -5 }).cellCount).toBe(OVERWORLD_CELLS);
    });

    it.each(['minecraft:overworld', 'minecraft:nether', 'minecraft:end', 'minecraft:caves', 'minecraft:amplified'])(
        'matches what compiling %s alone registers, for every router slot',
        (id) => {
            // The walk has to reach exactly the nodes the compiler compiles. A node type
            // missing from `densityInputsOf` would leave an `interpolated` node out of the size.
            // The standalone compiler never compiles anything, so its answer comes from the
            // walk alone.
            for (const [name, slot] of Object.entries(data.settings(id).noiseRouter)) {
                const alone = new DensityFunctionCompiler({
                    noise: () => {
                        throw new Error('not sampled');
                    },
                    random: () => {
                        throw new Error('not sampled');
                    },
                    endIslandRandom: () => {
                        throw new Error('not sampled');
                    }
                });
                const state = new RandomState(data, SEED, data.settings(id));
                state.sampler(slot as DensityFunctionNode);

                expect(state.interpolationCellSizeOf(slot as DensityFunctionNode), `${id} ${name}`).toEqual(
                    state.interpolationCellSize
                );
                expect(alone.interpolationCellSizeOf(slot as DensityFunctionNode), `${id} ${name}`).toEqual(
                    state.interpolationCellSize
                );
            }
        }
    );
});

describe('densityInputsOf', () => {
    it('lists nothing for a node with no operands', () => {
        expect(densityInputsOf({ type: 'constant', value: 1 })).toEqual([]);
        expect(densityInputsOf({ type: 'beardifier' })).toEqual([]);
    });

    it('lists the operands of a binary node in the order they are written', () => {
        const left: DensityFunctionNode = { type: 'constant', value: 1 };
        const right: DensityFunctionNode = { type: 'constant', value: 2 };

        expect(densityInputsOf({ type: 'add', left, right })).toEqual([left, right]);
    });

    it('lists the coordinate of every nested spline', () => {
        const outer: DensityFunctionNode = { type: 'constant', value: 1 };
        const inner: DensityFunctionNode = { type: 'constant', value: 2 };

        const inputs = densityInputsOf({
            type: 'spline',
            spline: {
                kind: 'multipoint',
                coordinate: outer,
                locations: [0],
                values: [
                    { kind: 'constant', value: 0 },
                    { kind: 'multipoint', coordinate: inner, locations: [0], values: [], derivatives: [] }
                ],
                derivatives: [0]
            }
        });

        expect(inputs).toEqual([outer, inner]);
    });
});
