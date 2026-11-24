import { describe, expect, it } from 'vitest';

import { MAP_SIZE, bedrockPixelOf, biomePreviewColors, newSavedMap } from './savedMap';

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

describe('a map pixel on a Bedrock client', () => {
    it("is Java's color at its brightness, red in the low byte and opaque", () => {
        // Orange 0xD87F33 at 220/255: 186, 109, 44.
        expect(bedrockPixelOf(packedColor(ORANGE, NORMAL))).toBe(0xff2c6dba);
    });

    it('is transparent where nothing was drawn', () => {
        expect(bedrockPixelOf(0)).toBe(0);
    });
});
