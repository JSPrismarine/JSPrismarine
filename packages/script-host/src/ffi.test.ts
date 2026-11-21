import { describe, expect, it } from 'vitest';

import { bindBunLibrary } from './ffi';
import type { BunFfi } from './ffi';

/** What the fake `bun:ffi` saw: each call's arguments, and each callback it made. */
interface FakeBun {
    readonly calls: Map<string, unknown[][]>;
    readonly closed: string[];
    definitions?: Record<string, { args: string[]; returns: string }>;
}

/**
 * Binds the library through a fake `bun:ffi` that records calls and returns Bun's pointer numbers,
 * null for a null one.
 */
const bindUnderBun = (results: Record<string, unknown> = {}) => {
    const fake: FakeBun = { calls: new Map(), closed: [] };
    const bunFfi: BunFfi = {
        dlopen: (_path: string, definitions: Record<string, { args: string[]; returns: string }>) => {
            fake.definitions = definitions;
            return {
                symbols: Object.fromEntries(
                    Object.keys(definitions).map((name) => [
                        name,
                        (...args: unknown[]) => {
                            fake.calls.set(name, [...(fake.calls.get(name) ?? []), args]);
                            return results[name] ?? 0;
                        }
                    ])
                ),
                close: () => fake.closed.push('library')
            };
        },
        ptr: () => 0x2000,
        JSCallback: class {
            public readonly ptr = 0x3000;
            public constructor(public readonly callback: (...args: number[]) => number) {}
            public close(): void {
                fake.closed.push('callback');
            }
        }
    };
    return { fake, bound: bindBunLibrary('libjsp_script_host.so', bunFfi) };
};

describe('the script host binding under Bun', () => {
    it('declares every argument in bun:ffi kinds', () => {
        const { fake } = bindUnderBun();

        expect(fake.definitions?.jsh_engine_create).toEqual({
            args: ['ptr', 'ptr', 'i32', 'f64', 'f64'],
            returns: 'ptr'
        });
        expect(fake.definitions?.jsh_get).toEqual({ args: ['ptr', 'i32', 'ptr'], returns: 'i32' });
    });

    it('passes pointers as numbers, strings as NUL-terminated bytes, and answers pointers as bigints', () => {
        const { fake, bound } = bindUnderBun({ jsh_engine_create: 0x1000, jsh_get: 7 });

        expect(bound.symbols.jsh_engine_create(0x3000n, 0x2000n, 64, 0, 0)).toBe(0x1000n);
        expect(bound.symbols.jsh_get(0x1000n, 2, 'name')).toBe(7);
        const [engine, object, key] = fake.calls.get('jsh_get')?.[0] ?? [];
        expect(engine).toBe(0x1000);
        expect(object).toBe(2);
        expect(key).toStrictEqual(Buffer.from('name\0', 'utf8'));
    });

    it('answers 0n for the null pointer Bun returns as null', () => {
        const { bound } = bindUnderBun({ jsh_engine_create: null });

        expect(bound.symbols.jsh_engine_create(0x3000n, 0x2000n, 64, 0, 0)).toBe(0n);
    });

    it('closes a host callback when it is unregistered, and the rest with the library', () => {
        const { fake, bound } = bindUnderBun();

        const pointer = bound.registerHostCallback(() => 0);
        expect(pointer).toBe(0x3000n);
        expect(bound.pointerOf(new SharedArrayBuffer(8))).toBe(0x2000n);
        bound.unregisterHostCallback(pointer);
        bound.registerHostCallback(() => 0);
        bound.close();

        expect(fake.closed).toEqual(['callback', 'callback', 'library']);
    });
});
