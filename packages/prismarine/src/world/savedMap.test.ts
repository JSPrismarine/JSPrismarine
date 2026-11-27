import { describe, expect, it } from 'vitest';

import {
    MAP_SIZE,
    biomePreviewColors,
    blankSavedMap,
    drawnColors,
    holderDecorationOnMap,
    newSavedMap,
    scaledSavedMap
} from './savedMap';

/** Java's packed map color: the color id over the brightness id. */
const packedColor = (color: number, brightness: number): number => (color << 2) | brightness;
const ORANGE = 15;
const BROWN = 26;
const LOW = 0;
const NORMAL = 1;
const LOWEST = 3;

const treasure = (x: number, z: number, scale = 1) =>
    newSavedMap({
        dimension: 'minecraft:overworld',
        x,
        z,
        scale,
        decorations: { '+': { type: 'minecraft:red_x', x, z, rotation: 180 } }
    });

describe('a new saved map', () => {
    it("centers on Java's map grid and places the marker in half pixels from the center", () => {
        // A zoom 1 cell is 256 blocks, offset by 64: (400, -800) is in the cell centered on
        // (320, -704), 80 blocks east and 96 north of it, which is 40 and -48 pixels.
        const map = treasure(400, -800);

        expect(map).toMatchObject({ dimension: 'minecraft:overworld', centerX: 320, centerZ: -704, scale: 1 });
        // Java's `(byte) (int) (pixels * 2 + 0.5)` truncates toward zero, so -96 + 0.5 is -95, and
        // 180 degrees is eight sixteenths of a turn.
        expect(map.decorations).toEqual([{ type: 'minecraft:red_x', x: 80, y: -95, rotation: 8 }]);
    });

    it('pins a marker outside the map to its edge rather than dropping it', () => {
        const map = newSavedMap({
            dimension: 'minecraft:overworld',
            x: 0,
            z: 0,
            scale: 0,
            decorations: { '+': { type: 'minecraft:mansion', x: 5000, z: -5000, rotation: 180 } }
        });

        expect(map.decorations[0]).toMatchObject({ x: 127, y: -128 });
    });
});

describe("an explorer map's biome preview", () => {
    const at = (colors: Uint8Array, x: number, z: number): number => colors[x + z * MAP_SIZE]!;
    // A zoom 0 map centered on (64, 64) covers blocks 0 to 127, one block a pixel.
    const map = { centerX: 64, centerZ: 64, scale: 0 };

    it('draws nothing where there is no water', () => {
        expect(biomePreviewColors(map, () => false).every((color) => color === 0)).toBe(true);
    });

    it('draws the coast orange on the water side and brown on the land side, x first', () => {
        // Water to the west of x 64. A pixel's color is indexed `x + z * 128` and read from the
        // block at that x, so a transposed map would draw this line along z instead.
        const colors = biomePreviewColors(map, (x) => x < 64);

        // The last water column has five wet neighbors: orange, low.
        expect(at(colors, 63, 40)).toBe(packedColor(ORANGE, LOW));
        // The first land column has three: brown, lowest.
        expect(at(colors, 64, 40)).toBe(packedColor(BROWN, LOWEST));
        // Far from the coast on land: nothing.
        expect(at(colors, 100, 40)).toBe(0);
        // The outer ring is never drawn.
        expect(at(colors, 0, 40)).toBe(0);
    });

    it('draws open water blank but for the stripes on even rows', () => {
        const colors = biomePreviewColors(map, () => true);

        // Odd row, eight wet neighbors: blank.
        expect(at(colors, 64, 65)).toBe(0);
        // Even row: Java's band, (64 + (int) (Mth.sin(64) * 7)) / 8 % 5 = (64 + 6) / 8 % 5 = 3,
        // which is normal brightness.
        expect(at(colors, 64, 64)).toBe(packedColor(ORANGE, NORMAL));
        // The band runs along x and bends with the row: (66 + 6) / 8 % 5 = 4 is low, while row 66
        // has (int) (Mth.sin(66) * 7) = 0, so (64 + 0) / 8 % 5 = 3 is normal.
        expect(at(colors, 66, 64)).toBe(packedColor(ORANGE, LOW));
        expect(at(colors, 64, 66)).toBe(packedColor(ORANGE, NORMAL));
    });
});

describe('a blank map', () => {
    it('centers on the grid cell it was made in, with nothing drawn and no markers', () => {
        const map = blankSavedMap({ dimension: 'minecraft:overworld', x: 100, z: -20, scale: 0 });

        expect(map).toMatchObject({ centerX: 128, centerZ: 0, decorations: [], locked: false });
        expect(map.unlimitedTracking).toBe(false);
        expect(map.colors?.every((color) => color === 0)).toBe(true);
    });

    it('is never given a biome preview', () => {
        const map = blankSavedMap({ dimension: 'minecraft:overworld', x: 0, z: 0, scale: 0 });

        expect(drawnColors(map, () => true).every((color) => color === 0)).toBe(true);
    });
});

describe("an explorer map's pixels", () => {
    it('are its biome preview, drawn once', () => {
        const map = treasure(400, -800);
        expect(map.colors).toBeUndefined();

        const colors = drawnColors(map, (x) => x < 320);

        expect(colors.some((color) => color !== 0)).toBe(true);
        expect(drawnColors(map, () => false)).toBe(colors);
    });
});

describe("a holder's marker", () => {
    const at = (x: number, z: number, unlimitedTracking = false, dimension = 'minecraft:overworld') =>
        holderDecorationOnMap(
            { centerX: 0, centerZ: 0, scale: 0, dimension, unlimitedTracking },
            { x, z, yaw: 90, gameTime: 0 }
        );

    it('is an arrow facing the way the holder does while it is on the map', () => {
        // 90 degrees is a quarter turn, four sixteenths. Java adds half a step and casts, so -19.5
        // half pixels truncates to -19.
        expect(at(10, -10)).toEqual({ type: 'minecraft:player', x: 20, y: -19, rotation: 4 });
    });

    it('is a dot at the edge a little way off the map, and is dropped further off', () => {
        expect(at(100, 0)).toMatchObject({ type: 'minecraft:player_off_map', x: 127 });
        expect(at(400, 0)).toBeUndefined();
    });

    it('is a small dot at the edge far off a map with unlimited tracking', () => {
        expect(at(400, 0, true)).toMatchObject({ type: 'minecraft:player_off_limits', x: 127 });
    });

    it('spins by the clock in the Nether rather than facing the holder', () => {
        const spun = (gameTime: number) =>
            holderDecorationOnMap(
                { centerX: 0, centerZ: 0, scale: 0, dimension: 'minecraft:the_nether', unlimitedTracking: false },
                { x: 0, z: 0, yaw: 90, gameTime }
            )?.rotation;

        expect(new Set(Array.from({ length: 20 }, (_unused, tick) => spun(tick * 10))).size).toBeGreaterThan(1);
    });
});

describe('a map extended with paper', () => {
    it('zooms out one step around the cell holding its old center, blank and tracking as before', () => {
        // Java's grid is offset by 64 blocks: this map centers on (256, -128), and one zoom out
        // the 256-block cell that holds that point centers on (320, -192).
        const map = blankSavedMap({ dimension: 'minecraft:overworld', x: 200, z: -100, scale: 0 });
        const scaled = scaledSavedMap(map);

        expect([map.centerX, map.centerZ]).toEqual([256, -128]);
        expect(scaled.scale).toBe(1);
        expect([scaled.centerX, scaled.centerZ]).toEqual([320, -192]);
        expect(scaled.colors?.every((color) => color === 0)).toBe(true);
        expect(scaled.trackingPosition).toBe(map.trackingPosition);
    });

    it('stops at the furthest zoom', () => {
        const map = blankSavedMap({ dimension: 'minecraft:overworld', x: 0, z: 0, scale: 4 });

        expect(scaledSavedMap(map).scale).toBe(4);
    });
});
