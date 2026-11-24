import { describe, expect, it } from 'vitest';

import { Brightness, MapColors, packedMapColor } from './mapColors';
import type { MapColumn, MapTerrain } from './mapRender';
import { updateMapAround } from './mapRender';
import { MAP_SIZE } from './savedMap';

/** A scale 0 map centered on the origin, Java's grid cell for a map made there. */
const MAP = { centerX: 0, centerZ: 0, scale: 0 };

/** Terrain loaded everywhere, each column given by a function of its block. */
const terrainOf = (column: (x: number, z: number) => MapColumn, hasCeiling = false): MapTerrain => ({
    hasCeiling,
    isLoaded: () => true,
    column
});

const flatGrass = terrainOf(() => ({ colorId: MapColors.grass.id, y: 64, waterDepth: 0 }));

/** A map's pixels, painted by every call's writes, with the pixels each call wrote. */
const canvas = () => {
    const colors = new Uint8Array(MAP_SIZE * MAP_SIZE);
    const writes: [number, number][] = [];
    const paint = (x: number, z: number, packed: number): boolean => {
        writes.push([x, z]);
        const changed = colors[x + z * MAP_SIZE] !== packed;
        colors[x + z * MAP_SIZE] = packed;
        return changed;
    };
    return { colors, writes, paint, at: (x: number, z: number) => colors[x + z * MAP_SIZE] };
};

/** Holds the map at a block for sixteen ticks, which reaches every column once. */
const holdFor16Ticks = (terrain: MapTerrain, paint: ReturnType<typeof canvas>['paint'], x = 0.5, z = 0.5): void => {
    for (let step = 1; step <= 16; step++) updateMapAround(MAP, { x, z, step }, terrain, paint);
};

describe('a held map filling in', () => {
    it('draws flat ground in its color at normal brightness, out to the reach of the holder', () => {
        const { at, paint } = canvas();

        holdFor16Ticks(flatGrass, paint);

        const grass = packedMapColor(MapColors.grass.id, Brightness.NORMAL);
        // The holder stands on pixel (64, 64), and a scale 0 map reaches 128 pixels.
        expect(at(64, 64)).toBe(grass);
        expect(at(0, 64)).toBe(grass);
        expect(at(127, 127)).toBe(grass);
    });

    it('redraws one sixteenth of the columns a tick when nothing changed', () => {
        const { writes, paint } = canvas();
        holdFor16Ticks(flatGrass, paint);
        writes.length = 0;

        updateMapAround(MAP, { x: 0.5, z: 0.5, step: 3 }, flatGrass, paint);

        const columns = new Set(writes.map(([x]) => x));
        expect([...columns].every((x) => (x & 15) === 3)).toBe(true);
        expect(columns.size).toBe(MAP_SIZE / 16);
    });

    it('also redraws the column after one that changed, in the same tick', () => {
        const { writes, paint } = canvas();

        updateMapAround(MAP, { x: 0.5, z: 0.5, step: 3 }, flatGrass, paint);

        // Every column of a blank map changes, so each one drags the next in.
        expect(new Set(writes.map(([x]) => x)).size).toBeGreaterThan(MAP_SIZE / 16);
    });

    it('shades ground rising to the south bright and ground falling to it dark', () => {
        const rising = canvas();
        const falling = canvas();

        holdFor16Ticks(
            terrainOf((_x, z) => ({ colorId: MapColors.stone.id, y: 64 + 2 * z, waterDepth: 0 })),
            rising.paint
        );
        holdFor16Ticks(
            terrainOf((_x, z) => ({ colorId: MapColors.stone.id, y: 64 - 2 * z, waterDepth: 0 })),
            falling.paint
        );

        expect(rising.at(64, 64)).toBe(packedMapColor(MapColors.stone.id, Brightness.HIGH));
        expect(falling.at(64, 64)).toBe(packedMapColor(MapColors.stone.id, Brightness.LOW));
    });

    it('shades water by its depth, checkered between two steps', () => {
        const waterOf = (waterDepth: number) => {
            const { at, paint } = canvas();
            holdFor16Ticks(
                terrainOf(() => ({ colorId: MapColors.water.id, y: 62, waterDepth })),
                paint
            );
            return [at(64, 64), at(65, 64)];
        };
        const water = (brightness: Brightness) => packedMapColor(MapColors.water.id, brightness);

        expect(waterOf(1)).toEqual([water(Brightness.HIGH), water(Brightness.HIGH)]);
        expect(waterOf(5)).toEqual([water(Brightness.NORMAL), water(Brightness.NORMAL)]);
        expect(waterOf(8)).toEqual([water(Brightness.NORMAL), water(Brightness.LOW)]);
        expect(waterOf(12)).toEqual([water(Brightness.LOW), water(Brightness.LOW)]);
    });

    it('leaves a pixel in a chunk that is not loaded as it is', () => {
        const { at, paint } = canvas();

        holdFor16Ticks({ ...flatGrass, isLoaded: (x) => x >= 0 }, paint);

        expect(at(63, 64)).toBe(0);
        expect(at(64, 64)).not.toBe(0);
    });

    it('dithers the edge of its reach, drawing only every other pixel there', () => {
        const { at, paint } = canvas();
        // Standing at the map's west edge, so the reach's edge, 127 pixels east, is on the map.
        holdFor16Ticks(flatGrass, paint, -63.5, 0.5);

        // Pixel (0, 64) is under the holder. Beyond 126 pixels of it, only odd checker squares are drawn.
        expect(at(126, 64)).not.toBe(0);
        expect(at(127, 64)).not.toBe(0);
        expect(at(127, 65)).toBe(0);
    });

    it('gives a zoomed-out pixel the color most of its blocks show', () => {
        const { at, paint } = canvas();
        // Scale 1: one pixel is two by two blocks, and one block in four is sand.
        const terrain = terrainOf((x, z) => ({
            colorId: (x & 1) === 0 && (z & 1) === 0 ? MapColors.sand.id : MapColors.grass.id,
            y: 64,
            waterDepth: 0
        }));

        for (let step = 1; step <= 16; step++) {
            updateMapAround({ centerX: 64, centerZ: 64, scale: 1 }, { x: 64.5, z: 64.5, step }, terrain, paint);
        }

        expect(at(64, 64)! >> 2).toBe(MapColors.grass.id);
    });

    it('draws a dimension with a ceiling as dirt and stone noise, within half the reach', () => {
        const { colors, at, paint } = canvas();

        holdFor16Ticks({ ...flatGrass, hasCeiling: true }, paint);

        const drawn = new Set([...colors].filter((color) => color !== 0).map((color) => color >> 2));
        expect(drawn).toEqual(new Set([MapColors.dirt.id, MapColors.stone.id]));
        expect(at(64, 64)).not.toBe(0);
        expect(at(64, 0)).toBe(0);
    });
});
