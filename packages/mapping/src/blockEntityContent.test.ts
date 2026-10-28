import { describe, expect, it } from 'vitest';

import {
    bedrockBannerType,
    bedrockDyeIndexOf,
    bedrockSignTextColorOf,
    isOminousBannerPattern,
    javaBannerPatternToBedrock,
    javaBannerPatternsWithBedrockCodes
} from './blockEntityContent';
import { javaIdentifiersTable } from './tables';

/** Java 26.3's own dye color order, which is what the Bedrock index counts backwards from. */
const JAVA_DYE_ORDER = [
    'white',
    'orange',
    'magenta',
    'light_blue',
    'yellow',
    'lime',
    'pink',
    'gray',
    'light_gray',
    'cyan',
    'purple',
    'blue',
    'brown',
    'green',
    'red',
    'black'
];

describe('javaBannerPatternToBedrock', () => {
    it('answers every banner pattern the pinned Java 26.3 census publishes', () => {
        const published = javaIdentifiersTable.registries['banner_pattern'] ?? [];

        expect(published.filter((pattern) => javaBannerPatternToBedrock(pattern) === undefined)).toEqual([]);
    });

    it('names no pattern Java 26.3 does not publish', () => {
        const published = new Set(javaIdentifiersTable.registries['banner_pattern'] ?? []);

        expect(javaBannerPatternsWithBedrockCodes().filter((pattern) => !published.has(pattern))).toEqual([]);
    });

    it('gives each pattern its own code', () => {
        const codes = javaBannerPatternsWithBedrockCodes().map((pattern) => javaBannerPatternToBedrock(pattern));

        expect(new Set(codes).size).toBe(codes.length);
    });

    it('spells the three patterns the structure templates use', () => {
        expect(javaBannerPatternToBedrock('minecraft:triangle_top')).toBe('tt');
        expect(javaBannerPatternToBedrock('minecraft:triangle_bottom')).toBe('bt');
        expect(javaBannerPatternToBedrock('minecraft:flower')).toBe('flo');
    });

    it('keeps the two patterns Java renamed under their current names', () => {
        expect(javaBannerPatternToBedrock('minecraft:bricks')).toBe('bri');
        expect(javaBannerPatternToBedrock('minecraft:curly_border')).toBe('cbo');
        expect(javaBannerPatternToBedrock('minecraft:field_masoned')).toBeUndefined();
        expect(javaBannerPatternToBedrock('minecraft:bordure_indented')).toBeUndefined();
    });

    it('has no code for a pattern a datapack shipped', () => {
        expect(javaBannerPatternToBedrock('example:spiral')).toBeUndefined();
    });
});

describe('bedrockDyeIndexOf', () => {
    it('counts the sixteen backwards from Java', () => {
        for (const [index, color] of JAVA_DYE_ORDER.entries()) {
            expect(bedrockDyeIndexOf(color)).toBe(15 - index);
        }
    });

    it('rejects a word that is not one of the sixteen dyes', () => {
        expect(bedrockDyeIndexOf('turquoise')).toBeUndefined();
        expect(bedrockDyeIndexOf('')).toBeUndefined();
    });
});

describe('isOminousBannerPattern', () => {
    const ominous = [
        { pattern: 'minecraft:rhombus', color: 'cyan' },
        { pattern: 'minecraft:stripe_bottom', color: 'light_gray' },
        { pattern: 'minecraft:stripe_center', color: 'gray' },
        { pattern: 'minecraft:border', color: 'light_gray' },
        { pattern: 'minecraft:stripe_middle', color: 'black' },
        { pattern: 'minecraft:half_horizontal', color: 'light_gray' },
        { pattern: 'minecraft:circle', color: 'light_gray' },
        { pattern: 'minecraft:border', color: 'black' }
    ];

    it('recognizes the eight layers a pillager outpost banner carries', () => {
        expect(isOminousBannerPattern(ominous)).toBe(true);
    });

    it('rejects the same layers in another order', () => {
        expect(isOminousBannerPattern([...ominous].reverse())).toBe(false);
    });

    it('rejects one layer recolored', () => {
        const recolored = ominous.map((layer, index) => (index === 0 ? { ...layer, color: 'red' } : layer));

        expect(isOminousBannerPattern(recolored)).toBe(false);
    });

    it('rejects the village banners and a bare banner', () => {
        expect(
            isOminousBannerPattern([
                { pattern: 'minecraft:triangle_top', color: 'black' },
                { pattern: 'minecraft:triangle_bottom', color: 'black' }
            ])
        ).toBe(false);
        expect(isOminousBannerPattern([])).toBe(false);
    });
});

describe('bedrockSignTextColorOf', () => {
    it('packs the alpha byte into every one of the sixteen', () => {
        for (const color of JAVA_DYE_ORDER) {
            const argb = bedrockSignTextColorOf(color);

            expect(argb).toBeDefined();
            expect((argb as number) >>> 24).toBe(0xff);
        }
    });

    it('writes the value Bedrock treats as the default for black', () => {
        expect(bedrockSignTextColorOf('black')).toBe(-16777216);
    });

    it('writes the Java white rather than the darker Bedrock one', () => {
        expect(bedrockSignTextColorOf('white')).toBe(-393218);
    });

    it('rejects a word that is not one of the sixteen dyes', () => {
        expect(bedrockSignTextColorOf('turquoise')).toBeUndefined();
    });
});

describe('bedrockBannerType', () => {
    it('names the two values Bedrock has', () => {
        expect(bedrockBannerType).toEqual({ ominous: 1, normal: 0 });
    });
});
