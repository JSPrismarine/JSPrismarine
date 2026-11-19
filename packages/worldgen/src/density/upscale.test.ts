import { WorldgenErrors } from '@jsprismarine/errors/worldgen';
import { describe, expect, it } from 'vitest';

import { parseDensityFunction, SINCE_UPSCALE_DENSITY_FUNCTION } from './parse';

const noReferences = (id: string): never => {
    throw new TypeError(`no reference expected, got ${id}`);
};

/** The format before the change: 26.3's. */
const BEFORE = SINCE_UPSCALE_DENSITY_FUNCTION - 7;

const interpolated = { type: 'minecraft:interpolated', cell_size_xz: 4, cell_size_y: 8, input: 1 };
const upscale = (mode = 'interpolate_linear', xz: [number, number] = [4, 4]) => ({
    type: 'minecraft:upscale',
    input: 1,
    x: { cell_size: xz[0], mode },
    y: { cell_size: 8, mode },
    z: { cell_size: xz[1], mode }
});
const expected = { type: 'interpolated', input: { type: 'constant', value: 1 }, cellSizeXz: 4, cellSizeY: 8 };

describe('the upscale gate', () => {
    it('reads interpolated before the change and refuses upscale', () => {
        expect(parseDensityFunction(interpolated, noReferences, 'f', BEFORE)).toEqual(expected);
        expect(parseDensityFunction(interpolated, noReferences, 'f')).toEqual(expected);
        expect(() => parseDensityFunction(upscale(), noReferences, 'f', BEFORE)).toThrow(
            WorldgenErrors.UnknownDensityFunctionType
        );
    });

    it('reads upscale from the change on and refuses interpolated', () => {
        expect(parseDensityFunction(upscale(), noReferences, 'f', SINCE_UPSCALE_DENSITY_FUNCTION)).toEqual(expected);
        expect(() => parseDensityFunction(interpolated, noReferences, 'f', SINCE_UPSCALE_DENSITY_FUNCTION)).toThrow(
            WorldgenErrors.UnknownDensityFunctionType
        );
    });

    it('refuses the upscale modes and cell shapes it does not implement', () => {
        expect(() =>
            parseDensityFunction(upscale('interpolate_cubic'), noReferences, 'f', SINCE_UPSCALE_DENSITY_FUNCTION)
        ).toThrow(WorldgenErrors.UnsupportedUpscaleMode);
        expect(() =>
            parseDensityFunction(
                upscale('interpolate_linear', [4, 2]),
                noReferences,
                'f',
                SINCE_UPSCALE_DENSITY_FUNCTION
            )
        ).toThrow(WorldgenErrors.UnevenUpscaleCells);
    });

    it('refuses an upscale cell size of zero or less', () => {
        for (const size of [0, -4]) {
            expect(() =>
                parseDensityFunction(
                    upscale('interpolate_linear', [size, size]),
                    noReferences,
                    'f',
                    SINCE_UPSCALE_DENSITY_FUNCTION
                )
            ).toThrow(WorldgenErrors.NonPositiveUpscaleCell);
        }
    });
});
