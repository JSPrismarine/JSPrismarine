import { describe, expect, it } from 'vitest';

import type { ChunkStatus } from './ChunkStatus';
import type { ChunkStep } from './ChunkStep';
import { ChunkDependencies, ChunkStepBuilder } from './ChunkStep';

describe('ChunkDependencies', () => {
    const window = new ChunkDependencies(['terrain', 'terrain', 'biomes', 'structure_starts']);

    it('reads the guaranteed status by distance and nothing past the last ring', () => {
        expect(window.at(0)).toBe('terrain');
        expect(window.at(2)).toBe('biomes');
        expect(window.at(4)).toBeUndefined();
    });

    it('reports its size in rings and its radius in chunks', () => {
        expect(window.size).toBe(4);
        expect(window.radius).toBe(3);
        expect(new ChunkDependencies([]).radius).toBe(-1);
    });

    it('inverts into the radius out to which a status is guaranteed', () => {
        expect(window.radiusOf('terrain')).toBe(1);
        expect(window.radiusOf('biomes')).toBe(2);
        expect(window.radiusOf('structure_starts')).toBe(3);
        expect(window.radiusOf('features')).toBe(-1);
    });
});

describe('ChunkStepBuilder', () => {
    const directOf = (build: (builder: ChunkStepBuilder) => ChunkStepBuilder, target: ChunkStatus = 'terrain') =>
        build(new ChunkStepBuilder(target)).build().directDependencies.byDistance;

    it('seeds distance 0 with the parent status and leaves the rest of the window closed', () => {
        expect(directOf((step) => step)).toEqual(['biomes']);
        expect(directOf((step) => step, 'empty')).toEqual([]);
    });

    it('widens the window with the new status and raises what is already there', () => {
        expect(directOf((step) => step.addRequirement('structure_starts', 3))).toEqual([
            'biomes',
            'structure_starts',
            'structure_starts',
            'structure_starts'
        ]);
    });

    it('never lowers an entry, because overlapping requirements merge by taking the higher', () => {
        expect(directOf((step) => step.addRequirement('structure_starts', 2).addRequirement('biomes', 1))).toEqual([
            'biomes',
            'biomes',
            'structure_starts'
        ]);
    });

    it('merges the parent seed at distance 0 rather than overwriting it', () => {
        // This is why `spawn` reads `light` at distance 0 while being told to require only
        // `biomes` out to 1, and why `light` at distance 0 outlives a lower requirement.
        expect(directOf((step) => step.addRequirement('biomes', 1), 'spawn')).toEqual(['light', 'biomes']);
        expect(directOf((step) => step.addRequirement('features', 2), 'light')).toEqual([
            'initialize_light',
            'features',
            'features'
        ]);
    });

    it('defaults the block write radius to -1', () => {
        expect(new ChunkStepBuilder('terrain').build().blockStateWriteRadius).toBe(-1);
        expect(new ChunkStepBuilder('terrain').setBlockStateWriteRadius(0).build().blockStateWriteRadius).toBe(0);
    });

    it('leaves the accumulated dependencies equal to the direct ones when nothing is built below', () => {
        const step: ChunkStep = new ChunkStepBuilder('terrain').addRequirement('structure_starts', 2).build();
        expect(step.accumulatedDependencies.byDistance).toEqual(step.directDependencies.byDistance);
    });

    it('closes a window over the steps below it, widening by the inner window at each ring', () => {
        // A center that needs `biomes` one ring out needs whatever `biomes` itself needs, pushed
        // one ring further out. This is the whole of `buildAccumulatedDependencies`.
        const below = new Map<ChunkStatus, ChunkStep>();
        below.set('structure_starts', new ChunkStepBuilder('structure_starts', below).build());
        below.set(
            'structure_references',
            new ChunkStepBuilder('structure_references', below).addRequirement('structure_starts', 8).build()
        );
        below.set('biomes', new ChunkStepBuilder('biomes', below).addRequirement('structure_starts', 8).build());

        const terrain = new ChunkStepBuilder('terrain', below)
            .addRequirement('structure_starts', 8)
            .addRequirement('biomes', 1)
            .build();

        expect(terrain.accumulatedDependencies.at(0)).toBe('biomes');
        expect(terrain.accumulatedDependencies.at(1)).toBe('biomes');
        expect(terrain.accumulatedDependencies.at(2)).toBe('structure_starts');
        expect(terrain.accumulatedDependencies.size).toBe(10);
        expect(terrain.directDependencies.size).toBe(9);
    });
});
