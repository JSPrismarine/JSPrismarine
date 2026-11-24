import { describe, expect, it } from 'vitest';

import { Brightness, MapColors, bedrockPixelOf, mapColorIdOf, packedMapColor } from './mapColors';

describe('a map pixel on a Bedrock client', () => {
    it("is Java's color at its brightness, red in the low byte and opaque", () => {
        // Orange 0xD87F33 at 220/255: 186, 109, 44.
        expect(bedrockPixelOf(packedMapColor(MapColors.color_orange.id, Brightness.NORMAL))).toBe(0xff2c6dba);
    });

    it('is transparent where nothing was drawn, at any brightness', () => {
        expect(bedrockPixelOf(0)).toBe(0);
        expect(bedrockPixelOf(packedMapColor(MapColors.none.id, Brightness.HIGH))).toBe(0);
    });
});

describe('a map color by name', () => {
    it('reads the names @jsprismarine/mapping gives', () => {
        expect(mapColorIdOf('grass')).toBe(MapColors.grass.id);
        expect(mapColorIdOf('terracotta_black')).toBe(51);
    });

    it('reads an unknown name as none, which a map looks through', () => {
        expect(mapColorIdOf('example:mystery')).toBe(MapColors.none.id);
    });
});
