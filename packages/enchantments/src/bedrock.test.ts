import { describe, expect, it } from 'vitest';

import { SWEEPING_EDGE, projectToBedrock, romanNumeral } from './bedrock';
import type { EnchantmentIdentifierMapper } from './bedrock';
import { vanillaRegistry } from '../test/fixtures';

/**
 * A stand-in for `javaIdentifierToBedrock('enchantment', id)`. The two ids
 * below are the real Bedrock names; `sweeping_edge` has none, which is the
 * one reviewed loss among Java's 43.
 */
const mapper: EnchantmentIdentifierMapper = (enchantment) =>
    ({
        'minecraft:sharpness': 'minecraft:sharpness',
        'minecraft:infinity': 'minecraft:bow_infinity',
        'minecraft:unbreaking': 'minecraft:unbreaking'
    })[enchantment];

describe('Roman numerals', () => {
    it('writes the levels vanilla prints', () => {
        expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(romanNumeral)).toEqual([
            'I',
            'II',
            'III',
            'IV',
            'V',
            'VI',
            'VII',
            'VIII',
            'IX',
            'X'
        ]);
    });

    it('writes a level vanilla has no numeral for as a number', () => {
        // The language file stops at enchantment.level.10.
        expect(romanNumeral(11)).toBe('11');
        expect(romanNumeral(255)).toBe('255');
        expect(romanNumeral(0)).toBe('0');
    });
});

describe('projecting onto a Bedrock client', () => {
    it('maps an enchantment the client knows', () => {
        const { entries, forceGlint } = projectToBedrock(
            vanillaRegistry(),
            new Map([['minecraft:sharpness', 3]]),
            mapper
        );

        expect(entries).toEqual([
            { enchantment: 'minecraft:sharpness', level: 3, bedrock: 'minecraft:sharpness', lore: undefined }
        ]);
        expect(forceGlint).toBe(false);
    });

    it('maps an enchantment whose Bedrock name differs', () => {
        const { entries } = projectToBedrock(vanillaRegistry(), new Map([['minecraft:infinity', 1]]), mapper);
        expect(entries[0]?.bedrock).toBe('minecraft:bow_infinity');
    });

    it('falls back to a lore line and a forced glint for sweeping edge', () => {
        const { entries, forceGlint } = projectToBedrock(vanillaRegistry(), new Map([[SWEEPING_EDGE, 2]]), mapper);

        expect(entries[0]?.bedrock).toBeUndefined();
        expect(entries[0]?.lore).toBe('minecraft:sweeping_edge II');
        expect(forceGlint).toBe(true);
    });

    it('treats a datapack enchantment the same way', () => {
        const { entries, forceGlint } = projectToBedrock(
            vanillaRegistry(),
            new Map([['example:vampirism', 1]]),
            mapper
        );

        expect(entries[0]?.bedrock).toBeUndefined();
        expect(entries[0]?.lore).toBe('example:vampirism I');
        expect(forceGlint).toBe(true);
    });

    it('needs no forced glint when one enchantment does reach the client', () => {
        const { forceGlint } = projectToBedrock(
            vanillaRegistry(),
            new Map([
                [SWEEPING_EDGE, 2],
                ['minecraft:unbreaking', 3]
            ]),
            mapper
        );

        expect(forceGlint).toBe(false);
    });

    it('needs no forced glint on an unenchanted stack', () => {
        expect(projectToBedrock(vanillaRegistry(), new Map(), mapper).forceGlint).toBe(false);
    });

    it('lets a host supply its own lore text', () => {
        const { entries } = projectToBedrock(vanillaRegistry(), new Map([[SWEEPING_EDGE, 1]]), mapper, {
            lore: (_definition, id, level) => `Sweeping Edge ${level} (${id})`
        });

        expect(entries[0]?.lore).toBe('Sweeping Edge 1 (minecraft:sweeping_edge)');
    });

    it('projects without a registry, which is what a host with no enchantment data has', () => {
        const { entries, forceGlint } = projectToBedrock(undefined, new Map([[SWEEPING_EDGE, 2]]), mapper, {
            lore: (definition, id, level) => `${definition === undefined ? 'unknown' : 'known'} ${id} ${level}`
        });

        expect(entries[0]?.lore).toBe('unknown minecraft:sweeping_edge 2');
        expect(forceGlint).toBe(true);
    });
});
