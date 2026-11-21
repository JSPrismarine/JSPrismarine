import { describe, expect, it } from 'vitest';

import { NbtErrors } from '@jsprismarine/errors/nbt';

import { formatSnbt, javaDecimal, parseSnbt, parseSnbtCompound, quoteString } from './snbt';
import {
    byteTag,
    compoundTag,
    doubleTag,
    floatTag,
    intTag,
    listTag,
    longTag,
    shortTag,
    stringTag,
    tagsEqual
} from './tag';

describe('parseSnbt', () => {
    it.each([
        ['1b', byteTag(1)],
        ['-3s', shortTag(-3)],
        ['42', intTag(42)],
        ['42i', intTag(42)],
        ['9000000000L', longTag(9000000000n)],
        ['1.5f', floatTag(1.5)],
        ['1.5', doubleTag(1.5)],
        ['2d', doubleTag(2)],
        ['1e3', doubleTag(1000)],
        ['true', byteTag(1)],
        ['false', byteTag(0)],
        ['0x1F', intTag(31)],
        ['0b101', intTag(5)],
        ['1_000', intTag(1000)],
        ['255ub', byteTag(-1)],
        ['0xFFFFs', shortTag(-1)],
        ['0b', byteTag(0)]
    ])('reads %s with its type', (text, expected) => {
        expect(tagsEqual(parseSnbt(text), expected)).toBe(true);
    });

    it('reads quoted and bare strings with their escapes', () => {
        expect(parseSnbt('"a\\"b"')).toEqual(stringTag('a"b'));
        expect(parseSnbt("'it\\'s'")).toEqual(stringTag("it's"));
        expect(parseSnbt('"\\n\\t\\x41\\u200b"')).toEqual(stringTag('\n\tA\u200b'));
        expect(parseSnbt('hello_world')).toEqual(stringTag('hello_world'));
    });

    it('reads compounds, lists that mix types, and typed arrays', () => {
        const tag = parseSnbt('{ a: 1b, "b c": [1, "x"], d: [I; 1, 2b], e: [L; 3l], f: [B; 1b,], g: {} }');
        expect(formatSnbt(tag)).toBe('{a: 1b, "b c": [1, "x"], d: [I; 1, 2], e: [L; 3L], f: [B; 1B], g: {}}');
    });

    it('keeps the value of a narrower integer in a typed array', () => {
        expect(formatSnbt(parseSnbt('[I; 7s, -3b, 9]'))).toBe('[I; 7, -3, 9]');
        expect(formatSnbt(parseSnbt('[L; 7b, 8s, 9, -10L]'))).toBe('[L; 7L, 8L, 9L, -10L]');
    });

    it('keeps a key named __proto__ as an entry', () => {
        const tag = parseSnbtCompound('{__proto__: 1}');
        expect(Object.keys(tag.value)).toEqual(['__proto__']);
        expect(formatSnbt(tag)).toBe('{__proto__: 1}');
    });

    it.each(['{a:', '[1,', '"open', '1x', '128b', '2147483648', '[B; 1]', '{a: 1} extra', 'minecraft:stone'])(
        'refuses %s',
        (text) => {
            expect(() => parseSnbt(text)).toThrow(NbtErrors.SnbtSyntax);
        }
    );

    it('refuses a value that is not a compound where one is required', () => {
        expect(() => parseSnbtCompound('[1]')).toThrow(NbtErrors.SnbtSyntax);
    });
});

describe('formatSnbt', () => {
    it('prints each numeric type with its suffix', () => {
        expect(
            formatSnbt(
                listTag([
                    byteTag(1),
                    shortTag(2),
                    intTag(3),
                    longTag(4n),
                    floatTag(0.1),
                    doubleTag(0.1),
                    doubleTag(1e7)
                ])
            )
        ).toBe('[1b, 2s, 3, 4L, 0.1f, 0.1d, 1.0E7d]');
    });

    it('sorts compound keys and quotes the ones that need it', () => {
        expect(
            formatSnbt(
                compoundTag([
                    ['z', intTag(1)],
                    ['a b', intTag(2)],
                    ['a', intTag(3)]
                ])
            )
        ).toBe('{a: 3, "a b": 2, z: 1}');
    });

    it('reads back to an equal tag', () => {
        const text = '{list: [{id: "minecraft:stone", count: 3b}], f: 3.25f, l: -1L, s: \'say "hi"\'}';
        const tag = parseSnbt(text);
        expect(tagsEqual(parseSnbt(formatSnbt(tag)), tag)).toBe(true);
    });

    it('reads non-finite numbers back only with the nonFinite option', () => {
        const tag = listTag([
            floatTag(Number.POSITIVE_INFINITY),
            floatTag(Number.NEGATIVE_INFINITY),
            floatTag(Number.NaN),
            parseSnbt('1e999'),
            parseSnbt('-1e999'),
            doubleTag(Number.NaN)
        ]);
        const text = formatSnbt(tag);
        expect(text).toBe('[Infinityf, -Infinityf, NaNf, Infinityd, -Infinityd, NaNd]');
        expect(parseSnbt(text, { nonFinite: true })).toEqual(tag);
        // Java reads these words as strings, and so do commands.
        expect(parseSnbt('Infinityd')).toEqual(stringTag('Infinityd'));
    });
});

describe('quoteString', () => {
    it('picks the quote that needs no escape, as Java does', () => {
        expect(quoteString('plain')).toBe('"plain"');
        expect(quoteString('say "hi"')).toBe('\'say "hi"\'');
        expect(quoteString("it's")).toBe('"it\'s"');
        expect(quoteString('back\\slash')).toBe('"back\\\\slash"');
        expect(quoteString('line\nbreak')).toBe('"line\\nbreak"');
    });
});

describe('javaDecimal', () => {
    it.each([
        [1, false, '1.0'],
        [0.1, false, '0.1'],
        [0.001, false, '0.001'],
        [0.0001, false, '1.0E-4'],
        [1234567, false, '1234567.0'],
        [12345678, false, '1.2345678E7'],
        [-2.5, false, '-2.5'],
        [0.1, true, '0.1'],
        [1 / 3, true, '0.33333334'],
        [-0, false, '-0.0']
    ])('prints %d (single: %s) as %s', (value, single, expected) => {
        expect(javaDecimal(value, single)).toBe(expected);
    });
});
