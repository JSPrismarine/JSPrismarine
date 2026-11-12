import { describe, expect, it } from 'vitest';

import { plainOf, samePlain } from './PlainData';

describe('plainOf', () => {
    it('copies an interface value the way a JSON round trip would', () => {
        const stack: { identifier: string; count: number; lore?: string[] } = { identifier: 'minecraft:bow', count: 1 };
        const copy = plainOf({ mainhand: stack, offhand: undefined, slots: [stack, undefined] });

        expect(copy).toEqual({ mainhand: stack, slots: [stack, null] });
        expect(copy).toEqual(JSON.parse(JSON.stringify({ mainhand: stack, slots: [stack, null] })));
    });

    it('keeps bigints and copies typed arrays', () => {
        const position = new Float64Array([1, 2, 3]);
        const copy = plainOf({ id: 7n, position });

        expect(copy).toEqual({ id: 7n, position: new Float64Array([1, 2, 3]) });
        position[0] = 9;
        expect(copy).toEqual({ id: 7n, position: new Float64Array([1, 2, 3]) });
    });

    it('copies a Buffer, whose slice shares its memory', () => {
        const tags = Buffer.from([10, 0, 0]);
        const copy = plainOf({ tags });

        tags[0] = 9;
        expect(copy).toEqual({ tags: Buffer.from([10, 0, 0]) });
    });

    it('keeps a `__proto__` key as data, and tells two values under it apart', () => {
        const before = plainOf(JSON.parse('{"__proto__":1}'));
        const after = plainOf(JSON.parse('{"__proto__":{"x":2}}'));

        expect(before).not.toBeUndefined();
        expect(Object.keys(before ?? {})).toEqual(['__proto__']);
        expect(Object.getPrototypeOf(after)).toBe(Object.prototype);
        expect(samePlain(before!, after!)).toBe(false);
        expect(samePlain(before!, plainOf(JSON.parse('{"__proto__":1}'))!)).toBe(true);
    });

    it('refuses a value with no plain form', () => {
        expect(plainOf(new Map())).toBeUndefined();
        expect(plainOf({ run: () => 1 })).toBeUndefined();
        expect(plainOf(undefined)).toBeUndefined();
    });
});

describe('samePlain', () => {
    it('compares objects by content in any key order, and lists in order', () => {
        expect(samePlain({ x: 1, y: [1, 2] }, { y: [1, 2], x: 1 })).toBe(true);
        expect(samePlain([1, 2], [2, 1])).toBe(false);
        expect(samePlain({ x: 1 }, { x: 1, y: null })).toBe(false);
        expect(samePlain(new Float64Array([1]), new Float32Array([1]))).toBe(false);
        expect(samePlain(new Float64Array([1, 2]), new Float64Array([1, 2]))).toBe(true);
    });
});
