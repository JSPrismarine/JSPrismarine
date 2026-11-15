import type { BlockState } from '@jsprismarine/features';
import type { Aquifer } from '@jsprismarine/worldgen/chunk/Aquifer';
import { describe, expect, it } from 'vitest';

import { carveColumn } from './carveColumn';
import type { CarveColumnContext } from './carveColumn';
import { GenerationRegion } from './GenerationRegion';
import { createJavaBlockOracle } from './javaBlockOracle';

const tile = (): GenerationRegion =>
    new GenerationRegion({
        chunkX: 0,
        chunkZ: 0,
        minY: -64,
        height: 384,
        radius: 0,
        seaLevel: 63,
        seed: 1234n,
        blocks: createJavaBlockOracle(new Map()),
        biomeAt: () => 'minecraft:plains'
    });

/** An aquifer that answers per y, with a barrier (undefined) wherever the table says so. */
const aquifer = (byY: Readonly<Record<number, string | undefined>>, scheduleAt: readonly number[] = []): Aquifer => {
    let last = 0;
    return {
        computeSubstance: (_x, y) => {
            last = y;
            return y in byY ? byY[y] : 'minecraft:air';
        },
        shouldScheduleFluidUpdate: () => scheduleAt.includes(last)
    };
};

const FLUIDS: Readonly<Record<string, 'water' | 'lava'>> = { 'minecraft:water': 'water', 'minecraft:lava': 'lava' };

const context = (region: GenerationRegion, water: Aquifer): CarveColumnContext => ({
    region,
    aquifer: water,
    oracle: {
        isAir: (state: BlockState) => state.name === 'minecraft:air' || state.name === 'minecraft:cave_air',
        hasTag: (state: BlockState, tag: string) =>
            tag === 'minecraft:uncarvable' && state.name === 'minecraft:bedrock',
        fluid: (state: BlockState) => FLUIDS[state.name] ?? 'empty'
    },
    surface: {
        topMaterial: () => 'minecraft:grass_block'
    }
});

describe('carveColumn', () => {
    it('leaves a block the aquifer keeps as a barrier, as applyCarvingMask does', () => {
        const region = tile();
        for (let y = 10; y <= 14; y++) region.writeName(1, y, 1, 'minecraft:stone');

        carveColumn(context(region, aquifer({ 12: undefined })), 1, 1, 10, 14);

        expect(region.stateAt(1, 12, 1).name).toBe('minecraft:stone');
        for (const y of [10, 11, 13, 14]) expect(region.stateAt(1, y, 1).name).toBe('minecraft:air');
    });

    it('writes the aquifer fluid and marks it when the aquifer asks for an update', () => {
        const region = tile();
        for (let y = 10; y <= 12; y++) region.writeName(1, y, 1, 'minecraft:stone');

        carveColumn(context(region, aquifer({ 10: 'minecraft:water', 11: 'minecraft:water' }, [10])), 1, 1, 10, 12);

        expect(region.stateAt(1, 11, 1).name).toBe('minecraft:water');
        expect(region.stateAt(1, 10, 1).name).toBe('minecraft:water');
        expect(region.centerFluidTicks()).toEqual([{ x: 1, y: 10, z: 1 }]);
    });

    it('latches on a barrier grass block and re-surfaces dirt under the next block it opens', () => {
        const region = tile();
        region.writeName(1, 14, 1, 'minecraft:grass_block');
        region.writeName(1, 13, 1, 'minecraft:stone');
        region.writeName(1, 12, 1, 'minecraft:dirt');

        // The grass block stays as a barrier, but Java reads it before the aquifer, so the latch holds.
        carveColumn(context(region, aquifer({ 14: undefined })), 1, 1, 13, 14);

        expect(region.stateAt(1, 14, 1).name).toBe('minecraft:grass_block');
        expect(region.stateAt(1, 13, 1).name).toBe('minecraft:air');
        // The dirt under the opened block takes the biome's top material.
        expect(region.stateAt(1, 12, 1).name).toBe('minecraft:grass_block');
    });

    it('never opens an uncarvable block', () => {
        const region = tile();
        region.writeName(1, -64, 1, 'minecraft:bedrock');

        carveColumn(context(region, aquifer({})), 1, 1, -64, -64);

        expect(region.stateAt(1, -64, 1).name).toBe('minecraft:bedrock');
    });
});
