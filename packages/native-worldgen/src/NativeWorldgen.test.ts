import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NativeLibraryError } from '@jsprismarine/errors/native-library';
import { NativeWorldgenErrors } from '@jsprismarine/errors/native-worldgen';

import { NativeWorldgen } from './NativeWorldgen';
import type { NativeNoiseLayer } from './NativeWorldgen';
import { nativeWorldgenAvailable } from './testing/library.test-utils';

/** A layer with a shuffled permutation table, the same one for a given seed. */
const layer = (seed: number, frequency: number, amplitude: number): NativeNoiseLayer => {
    const permutation = Array.from({ length: 256 }, (_, index) => index);
    let state = seed;
    for (let index = 255; index > 0; index--) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        const other = state % (index + 1);
        [permutation[index], permutation[other]] = [permutation[other] ?? 0, permutation[index] ?? 0];
    }
    return { permutation, offsetX: seed * 0.37, offsetY: seed * 0.11, offsetZ: seed * 0.73, frequency, amplitude };
};

const positions = (count: number): Float64Array => {
    const xyz = new Float64Array(count * 3);
    let state = 7;
    for (let index = 0; index < xyz.length; index++) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        xyz[index] = (state / 4294967296 - 0.5) * 60_000;
    }
    return xyz;
};

/** Whether this runtime has an FFI, without which loading fails before it opens any file. */
const ffiAvailable = process.versions.bun !== undefined || process.getBuiltinModule('node:ffi') !== undefined;

describe.runIf(ffiAvailable)('loading the library', () => {
    it('reports a file the operating system cannot load as a NativeLibraryError', () => {
        const path = join(mkdtempSync(join(tmpdir(), 'jsp-native-worldgen-')), 'not-a-library.so');
        writeFileSync(path, 'not a shared library');
        expect(() => NativeWorldgen.load(path)).toThrow(NativeLibraryError);
        expect(() => NativeWorldgen.load(path)).toThrow(NativeWorldgenErrors.LibraryDoesNotLoad);
        rmSync(join(path, '..'), { recursive: true, force: true });
    });
});

describe.runIf(nativeWorldgenAvailable())('the native noise stack', () => {
    let library: NativeWorldgen;
    beforeAll(() => {
        library = NativeWorldgen.load();
    });
    afterAll(() => library.close());

    it('gives one call per buffer the same bits as one call per position', () => {
        const stack = library.createStack([layer(1, 1 / 64, 1), layer(2, 1 / 32, 0.5), layer(3, 1 / 16, 0.25)]);
        const xyz = positions(1000);
        const out = new Float64Array(1000);
        stack.fill(xyz, out);
        const mismatches = Array.from(out).filter(
            (value, index) =>
                !Object.is(value, stack.get3(xyz[index * 3] ?? 0, xyz[index * 3 + 1] ?? 0, xyz[index * 3 + 2] ?? 0))
        );
        stack.destroy();

        expect(mismatches).toEqual([]);
    });

    it('sums its octaves in single precision, in order', () => {
        const first = library.createStack([layer(4, 1 / 8, 0.75)]);
        const second = library.createStack([layer(5, 1 / 4, 0.3)]);
        const both = library.createStack([layer(4, 1 / 8, 0.75), layer(5, 1 / 4, 0.3)]);
        const xyz = positions(200);
        for (let index = 0; index < 200; index++) {
            const [x, y, z] = [xyz[index * 3] ?? 0, xyz[index * 3 + 1] ?? 0, xyz[index * 3 + 2] ?? 0];
            expect(both.get3(x, y, z)).toBe(Math.fround(first.get3(x, y, z) + second.get3(x, y, z)));
        }
        for (const stack of [first, second, both]) stack.destroy();
    });

    it('answers zero on the integer lattice of a layer with no offset', () => {
        const stack = library.createStack([{ ...layer(6, 1, 1), offsetX: 0, offsetY: 0, offsetZ: 0 }]);
        expect([stack.get3(0, 0, 0), stack.get3(5, -3, 12), stack.get3(-100, 64, 7)]).toEqual([0, 0, 0]);
        stack.destroy();
    });

    it('reads every position before writing over it when the output shares its memory', () => {
        const stack = library.createStack([layer(9, 1, 1)]);
        const xyz = positions(4);
        const separate = new Float64Array(4);
        stack.fill(xyz, separate);
        // The output starts on the second position, so a write would land on unread coordinates.
        const shared = xyz.slice();
        stack.fill(shared, shared.subarray(3, 7));

        expect(Array.from(shared.subarray(3, 7))).toEqual(Array.from(separate));
        stack.destroy();
    });

    it('samples NaN and infinite coordinates without crossing undefined behavior', () => {
        const stack = library.createStack([layer(10, 1, 1)]);
        const odd = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 3e12, -3e12];
        const xyz = Float64Array.from(odd.flatMap((value) => [value, 0.5, value]));
        const out = new Float64Array(odd.length);
        stack.fill(xyz, out);

        expect(Array.from(out)).toEqual(odd.map((value) => stack.get3(value, 0.5, value)));
        stack.destroy();
    });

    it('refuses a permutation table of the wrong size and a destroyed stack', () => {
        expect(() => library.createStack([{ ...layer(7, 1, 1), permutation: [1, 2, 3] }])).toThrow(
            NativeWorldgenErrors.InvalidPermutationTable
        );
        const stack = library.createStack([layer(8, 1, 1)]);
        stack.destroy();
        stack.destroy();
        expect(() => stack.get3(0.5, 0.5, 0.5)).toThrow(NativeWorldgenErrors.StackDestroyed);
    });
});
