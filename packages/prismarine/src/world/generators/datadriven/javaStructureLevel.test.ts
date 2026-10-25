/**
 * The terrain seam a structure is laid out against.
 *
 * The case worth keeping here is the aquifer one. Java's `getBaseHeight` builds its column
 * through `NoiseChunk`, and in 26.3 that constructor reads the settings' `aquifers` block
 * rather than a disabled aquifer, so the surface a structure settles onto is the one an
 * underground lake reaches. A dimension is built below whose aquifer stands 12 blocks above
 * the sea the global picker would fill to, which is the gap a disabled aquifer would lose.
 */
import type { BlockState } from '@jsprismarine/features';
import { RandomState, WorldgenData } from '@jsprismarine/worldgen';
import { describe, expect, it } from 'vitest';

import { createNoiseStructureLevel } from './javaStructureLevel';

const SETTINGS = 'test:aquifer';

/** Everything open, so the only block in a column is the one the aquifer decides on. */
const OPEN_ROUTER = {
    temperature: 0,
    vegetation: 0,
    continents: 0,
    erosion: 0,
    depth: 0,
    ridges: 0,
    chunk_surface_level: 0,
    final_density: -1
};

/**
 * An aquifer that floods its cells partway.
 *
 * `exclusion` stays negative so the aquifer runs at all, and `fluid_level_floodedness` sits
 * between the partial and the full threshold, which sends the cell's surface through the
 * randomized path. With `fluid_level_spread` at zero that lands on the middle of the 40-block
 * fluid cell, which is y 20: twelve blocks above the sea level of 8.
 */
const PARTIAL_AQUIFER = {
    barrier: 0,
    fluid_level_floodedness: 0.5,
    fluid_level_spread: 0,
    lava: 0,
    exclusion: -1,
    surface_level: 30
};

const dataWith = (aquifers: unknown): WorldgenData =>
    new WorldgenData({
        densityFunctions: new Map(),
        noises: new Map(),
        noiseSettings: new Map([
            [
                SETTINGS,
                {
                    noise: { min_y: 0, height: 32 },
                    default_block: 'minecraft:stone',
                    default_fluid: 'minecraft:water',
                    noise_router: OPEN_ROUTER,
                    material_rule: 'test:surface',
                    sea_level: 8,
                    disable_mob_generation: true,
                    legacy_random_source: false,
                    ...(aquifers === undefined ? {} : { aquifers })
                }
            ]
        ])
    });

const levelOver = (aquifers: unknown) => {
    const data = dataWith(aquifers);
    const settings = data.settings(SETTINGS);
    return createNoiseStructureLevel({
        randomState: new RandomState(data, 1n, settings),
        settings,
        minY: 0,
        height: 32,
        noiseBiome: () => 'minecraft:plains',
        isSolid: (state: BlockState) => state.name === 'minecraft:stone',
        isFluid: (state: BlockState) => state.name === 'minecraft:water'
    });
};

describe('the noise structure level', () => {
    it('reports the surface the aquifer floods to, not the one the global fluid would', () => {
        expect(levelOver(PARTIAL_AQUIFER).baseHeight(0, 0, 'MOTION_BLOCKING')).toBe(20);
        expect(levelOver(undefined).baseHeight(0, 0, 'MOTION_BLOCKING')).toBe(8);
    });

    it('reads the same blocks through baseBlock as the height it reports', () => {
        const level = levelOver(PARTIAL_AQUIFER);

        expect(level.baseBlock(0, 19, 0).name).toBe('minecraft:water');
        expect(level.baseBlock(0, 20, 0).name).toBe('minecraft:air');
    });

    it('answers the same height whether or not the column was sampled first', () => {
        const fresh = levelOver(PARTIAL_AQUIFER);
        const warmed = levelOver(PARTIAL_AQUIFER);
        warmed.baseBlock(0, 0, 0);

        expect(warmed.baseHeight(0, 0, 'MOTION_BLOCKING')).toBe(fresh.baseHeight(0, 0, 'MOTION_BLOCKING'));
    });

    it('answers the dimension floor for a column holding nothing the heightmap accepts', () => {
        // Nothing is solid in an open dimension, so the ocean floor heightmap finds no block.
        expect(levelOver(PARTIAL_AQUIFER).baseHeight(0, 0, 'OCEAN_FLOOR')).toBe(0);
    });
});
