import { serialize, deserialize } from 'node:v8';

import { describe, expect, it } from 'vitest';

import {
    decodeReusable,
    encodeReusable,
    ReusableCache,
    ReusableMissError,
    reusableInput,
    unwrapReusable
} from './reusableInput';

/** What a task's input becomes on the other side of the channel. */
const overChannel = (value: unknown): unknown => deserialize(serialize(value));

const tile = (n: number) => ({ chunkX: n, states: new Uint16Array(64).fill(n).buffer });

describe('reusable task inputs', () => {
    it('sends a value once, then only its key, and the host puts the value back', () => {
        const held = new ReusableCache<true>(8);
        const kept = new ReusableCache<unknown>(8);
        const first = { seed: '1', terrain: [reusableInput('a', tile(1)), reusableInput('b', tile(2))] };
        const second = { seed: '1', terrain: [reusableInput('b', tile(2)), reusableInput('c', tile(3))] };

        const sentFirst = encodeReusable(first, held);
        const sentSecond = encodeReusable(second, held);

        // The second task carries one value; the tile it shares with the first goes as its key.
        expect(serialize(sentSecond).byteLength).toBeLessThan(serialize(sentFirst).byteLength);
        expect(decodeReusable(overChannel(sentFirst), kept)).toEqual({ seed: '1', terrain: [tile(1), tile(2)] });
        expect(decodeReusable(overChannel(sentSecond), kept)).toEqual({ seed: '1', terrain: [tile(2), tile(3)] });
    });

    it('keeps the record and the host in step as both forget the least recently used', () => {
        const held = new ReusableCache<true>(2);
        const kept = new ReusableCache<unknown>(2);
        for (const keys of [['a', 'b'], ['a'], ['c'], ['b'], ['a', 'c']]) {
            const input = { terrain: keys.map((key) => reusableInput(key, { key })) };
            expect(decodeReusable(overChannel(encodeReusable(input, held)), kept)).toEqual({
                terrain: keys.map((key) => ({ key }))
            });
        }
    });

    it('refuses a reference to a value the host does not hold', () => {
        const held = new ReusableCache<true>(8);
        encodeReusable({ terrain: [reusableInput('a', tile(1))] }, held);
        const again = encodeReusable({ terrain: [reusableInput('a', tile(1))] }, held);

        // A host that never saw the first task, as a replacement host has not.
        expect(() => decodeReusable(overChannel(again), new ReusableCache(8))).toThrow(ReusableMissError);
    });

    it('holds a key kept with an undefined value', () => {
        const held = new ReusableCache<true>(8);
        const sent = encodeReusable({ parts: [reusableInput('x', undefined), reusableInput('x', undefined)] }, held);

        expect(decodeReusable(overChannel(sent), new ReusableCache(8))).toEqual({ parts: [undefined, undefined] });
    });

    it('unwraps markers for a runner that keeps nothing, and leaves an input without them as it is', () => {
        const plain = { seed: '1', terrain: [tile(1)] };

        expect(unwrapReusable({ seed: '1', terrain: [reusableInput('a', tile(1))] })).toEqual(plain);
        expect(unwrapReusable(plain)).toBe(plain);
        expect(decodeReusable(plain, new ReusableCache(8))).toBe(plain);
    });
});
