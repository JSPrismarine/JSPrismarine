/**
 * Opens a native library through the running runtime's own FFI: `node:ffi` under Node.js and
 * `bun:ffi` under Bun. A package describes its C interface once as signatures, and gets one
 * function per symbol with the same calling convention on both runtimes.
 */

import { NativeLibraryErrors } from '@jsprismarine/errors/native-library';

/**
 * An argument or result kind. `buffer` passes a typed array's memory by address for the length
 * of the call; `pointer` is an address the library returned.
 */
export type FfiKind = 'i32' | 'f64' | 'void' | 'pointer' | 'buffer';

/** One symbol's C signature: its result, then its parameters in order. */
export type FfiSignature = readonly [result: FfiKind, parameters: readonly FfiKind[]];

/** A pointer the FFI hands to native code: a bigint under Node.js, a number under Bun. */
export type NativePointer = bigint | number;

/** A library opened with {@link bindNative}. */
export interface BoundNative<Symbols> {
    /** One function per symbol; an optional symbol the library lacks is undefined. */
    readonly symbols: Symbols;
    /**
     * The address of a buffer's memory. It stays valid only while the buffer is alive and is
     * neither transferred nor resized, so keep it unchanged until native code is done with the
     * address.
     */
    pointerOf(memory: ArrayBufferLike): NativePointer;
    close(): void;
}

/** The part of `node:ffi` this binding uses; Node.js 26 ships no types for it yet. */
export interface NodeFfi {
    dlopen(
        path: string,
        definitions: Record<string, { arguments: readonly string[]; return: string }>
    ): {
        functions: Record<string, (...args: unknown[]) => unknown>;
        lib: {
            close(): void;
            /** Binds one more symbol; throws when the library does not export it. */
            getFunction(
                name: string,
                definition: { arguments: readonly string[]; return: string }
            ): (...args: unknown[]) => unknown;
            /** Makes a native function pointer that runs `callback` on this thread. */
            registerCallback(
                signature: { arguments: readonly string[]; return: string },
                callback: (...args: number[]) => number
            ): bigint;
            unregisterCallback(pointer: bigint): void;
        };
    };
    getRawPointer(memory: ArrayBufferLike): bigint;
}

/** The part of `bun:ffi` this binding uses. */
interface BunFfi {
    dlopen(
        path: string,
        definitions: Record<string, { args: string[]; returns: string }>
    ): { symbols: Record<string, (...args: unknown[]) => unknown>; close(): void };
    ptr(view: Uint8Array): number;
}

const nodeKinds: Record<FfiKind, string> = {
    i32: 'int32',
    f64: 'float64',
    void: 'void',
    buffer: 'buffer',
    pointer: 'pointer'
};
const bunKinds: Record<FfiKind, string> = { i32: 'i32', f64: 'f64', void: 'void', buffer: 'ptr', pointer: 'ptr' };

/**
 * The `node:ffi` module as this file calls it.
 *
 * `process.getBuiltinModule` answers undefined on a Node.js built without FFI or started with
 * `--no-experimental-ffi`, which would otherwise fail later at `dlopen` with a TypeError that
 * names nothing.
 * @param ffi - What the runtime answered for `node:ffi`.
 * @param version - The running Node.js version, for the message.
 * @returns The module.
 * @throws {NativeLibraryError} When the runtime has no `node:ffi`.
 */
export const nodeFfiOf = (ffi: unknown, version: string): NodeFfi => {
    if (ffi === undefined) throw new NativeLibraryErrors.FfiUnavailable({ version });
    // `node:ffi` has no published types; NodeFfi above is the part this file calls.
    return ffi as NodeFfi;
};

/**
 * Loads `node:ffi` without its experimental warning, which would otherwise print on every start.
 * Only that one warning is held back. A binding that needs more than {@link bindNative} gives,
 * such as callbacks, opens its library with this.
 * @returns The module.
 * @throws {NativeLibraryError} When the runtime has no `node:ffi`.
 */
export const nodeFfi = (): NodeFfi => {
    const emitWarning = process.emitWarning;
    // emitWarning is overloaded, and this one function forwards every overload unchanged.
    process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
        const text = typeof warning === 'string' ? warning : warning.message;
        if (text.includes('FFI is an experimental feature')) return;
        Reflect.apply(emitWarning, process, [warning, ...rest]);
    }) as typeof process.emitWarning;
    try {
        return nodeFfiOf(process.getBuiltinModule('node:ffi'), process.version);
    } finally {
        process.emitWarning = emitWarning;
    }
};

/**
 * Opens a library with the running runtime's FFI.
 * @param path - The shared library's file.
 * @param signatures - Every symbol to bind, by name.
 * @param optional - Symbols a library built from older sources may lack; each stays undefined
 *   when it is missing, where a missing required symbol fails the load.
 * @returns The bound library.
 * @throws {NativeLibraryError} When Node.js has no `node:ffi`.
 * @throws {Error} When the library does not load or lacks a required symbol.
 */
export const bindNative = <Symbols>(
    path: string,
    signatures: { readonly [Name in keyof Symbols & string]: FfiSignature },
    optional: ReadonlySet<string> = new Set()
): BoundNative<Symbols> => {
    const entries: [string, FfiSignature][] = Object.entries(signatures);
    const required = entries.filter(([name]) => !optional.has(name));
    const extra = entries.filter(([name]) => optional.has(name));

    if (process.versions.bun !== undefined) {
        // `bun:ffi` has no types in this workspace; BunFfi above is the part this file calls.
        const bun = process.getBuiltinModule('bun:ffi' as 'node:fs') as unknown as BunFfi;
        const definitionOf = ([result, parameters]: FfiSignature) => ({
            args: parameters.map((kind) => bunKinds[kind]),
            returns: bunKinds[result]
        });
        const opened = bun.dlopen(
            path,
            Object.fromEntries(required.map(([name, signature]) => [name, definitionOf(signature)]))
        );
        const symbols = { ...opened.symbols };
        // `bun:ffi` binds symbols only through `dlopen`, which refuses a missing one, so each
        // optional symbol opens the library once more.
        const handles: { close(): void }[] = [opened];
        for (const [name, signature] of extra) {
            try {
                const one = bun.dlopen(path, { [name]: definitionOf(signature) });
                handles.push(one);
                const bound = one.symbols[name];
                if (bound !== undefined) symbols[name] = bound;
            } catch {
                // A build from before the symbol: it stays undefined.
            }
        }
        return {
            // The signatures name every member of Symbols, each bound with its C signature.
            symbols: symbols as Symbols,
            pointerOf: (memory) => bun.ptr(new Uint8Array(memory)),
            close: () => {
                for (const handle of handles.reverse()) handle.close();
            }
        };
    }

    const node = nodeFfi();
    const definitionOf = ([result, parameters]: FfiSignature) => ({
        arguments: parameters.map((kind) => nodeKinds[kind]),
        return: nodeKinds[result]
    });
    const opened = node.dlopen(
        path,
        Object.fromEntries(required.map(([name, signature]) => [name, definitionOf(signature)]))
    );
    const functions = { ...opened.functions };
    for (const [name, signature] of extra) {
        try {
            functions[name] = opened.lib.getFunction(name, definitionOf(signature));
        } catch {
            // A build from before the symbol: it stays undefined.
        }
    }
    return {
        // The signatures name every member of Symbols, each bound with its C signature.
        symbols: functions as Symbols,
        pointerOf: (memory) => node.getRawPointer(memory),
        close: () => opened.lib.close()
    };
};
