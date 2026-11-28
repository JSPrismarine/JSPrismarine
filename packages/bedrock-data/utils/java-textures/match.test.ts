import { describe, expect, it } from 'vitest';

import { isMaterialLayer, matchTextures, pixelKey, sameNamedJavaTexture } from './match.ts';
import type { MatchImage } from './match.ts';

/** A one-pixel image of a color, or a blank one. */
const pixel = (red: number, alpha = 255, width = 1): MatchImage => ({
    width,
    height: 1,
    pixels: Uint8Array.from({ length: width * 4 }, (_, i) => [red, 0, 0, alpha][i % 4]!)
});

describe('pixelKey', () => {
    it('ignores the color under a fully transparent pixel, but not the size', () => {
        expect(pixelKey(pixel(10, 0))).toBe(pixelKey(pixel(200, 0)));
        expect(pixelKey(pixel(10))).not.toBe(pixelKey(pixel(200)));
        expect(pixelKey(pixel(10, 255, 2))).not.toBe(pixelKey(pixel(10)));
    });
});

describe('sameNamedJavaTexture', () => {
    it("renames Bedrock's block and item folders and keeps the rest", () => {
        expect(sameNamedJavaTexture('textures/blocks/stone')).toBe('block/stone');
        expect(sameNamedJavaTexture('textures/items/apple')).toBe('item/apple');
        expect(sameNamedJavaTexture('textures/entity/pig/pig')).toBe('entity/pig/pig');
    });
});

describe('matchTextures', () => {
    const java = new Map<string, MatchImage>([
        ['block/stone', pixel(1)],
        ['block/oak_planks', pixel(2)],
        ['block/obsidian', pixel(3)],
        ['block/enchanting_table_bottom', pixel(3)],
        ['block/crying_obsidian', pixel(4)],
        ['block/respawn_anchor_bottom', pixel(4)],
        ['entity/blank', pixel(0, 0)],
        ['block/grass_block_side', pixel(5, 255, 2)]
    ]);
    const bedrock = new Map<string, MatchImage>([
        ['textures/blocks/stone', pixel(9)],
        ['textures/blocks/planks_oak', pixel(2)],
        ['textures/blocks/obsidian', pixel(3)],
        ['textures/blocks/enchanting_table_bottom', pixel(3)],
        ['textures/blocks/crying_obsidian_alt', pixel(4)],
        ['textures/entity/horse/armor_none', pixel(0, 0)],
        ['textures/blocks/grass_side', pixel(6, 255, 2)],
        ['textures/blocks/border', pixel(7)],
        ['textures/blocks/stone_mers', pixel(1)]
    ]);

    const matches = matchTextures(java, bedrock);

    it("pairs a texture with Java's of the same name and size, whatever its pixels", () => {
        expect(matches.matched.get('textures/blocks/stone')).toEqual(['block/stone']);
        expect(matches.matched.get('textures/blocks/enchanting_table_bottom')).toEqual([
            'block/enchanting_table_bottom'
        ]);
    });

    it('pairs a renamed texture by its pixels, with every Java texture no other Bedrock texture is named for', () => {
        expect(matches.matched.get('textures/blocks/planks_oak')).toEqual(['block/oak_planks']);
        expect(matches.matched.get('textures/blocks/crying_obsidian_alt')).toEqual([
            'block/crying_obsidian',
            'block/respawn_anchor_bottom'
        ]);
    });

    it('leaves blank images, differing art and material layers unmatched', () => {
        expect(matches.unmatched).toEqual([
            'textures/blocks/border',
            'textures/blocks/grass_side',
            'textures/entity/horse/armor_none'
        ]);
        expect(matches.matched.has('textures/blocks/stone_mers')).toBe(false);
        expect(isMaterialLayer('textures/blocks/stone_normal')).toBe(true);
        expect([matches.byName, matches.byPixels]).toEqual([3, 2]);
    });
});
