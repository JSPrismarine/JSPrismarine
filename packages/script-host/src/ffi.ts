/**
 * Binds the library's flat C interface (`native/include/jsp_script_host.h`) through the runtime's
 * own FFI: `node:ffi` under Node.js, `bun:ffi` under Bun. Every call is synchronous. The engine
 * calls back into JavaScript through one callback per engine, on the thread that created it, while
 * a call into the engine is running.
 */

import { nodeFfi } from '@jsprismarine/native-library/ffi';

/** A native address, as `node:ffi` passes one. The Bun binding converts its numbers to and from it. */
export type NativePointer = bigint;

/** The C interface, one method per exported function. */
export interface NativeSymbols {
    jsh_abi_version(): number;
    jsh_engine_create(
        host: NativePointer,
        buffer: NativePointer,
        capacity: number,
        memoryLimit: number,
        stackSize: number
    ): NativePointer;
    jsh_engine_destroy(engine: NativePointer): void;
    jsh_context_create(engine: NativePointer): number;
    jsh_context_select(engine: NativePointer, context: number): number;
    jsh_engine_set_buffer(engine: NativePointer, buffer: NativePointer, capacity: number): void;
    jsh_engine_set_budget(engine: NativePointer, perCallback: number, perTick: number): void;
    jsh_engine_begin_tick(engine: NativePointer): void;
    jsh_engine_stat(engine: NativePointer, stat: number): number;
    jsh_eval_script(engine: NativePointer, name: string, source: Uint8Array, length: number): number;
    jsh_eval_module(engine: NativePointer, name: string, source: Uint8Array, length: number): number;
    jsh_run_jobs(engine: NativePointer, context: number): number;
    jsh_call(engine: NativePointer, fn: number, thisValue: number, length: number): number;
    jsh_global(engine: NativePointer): number;
    jsh_get(engine: NativePointer, object: number, key: string): number;
    jsh_set(engine: NativePointer, object: number, key: string, value: number): number;
    jsh_host_function(engine: NativePointer, id: number, name: string, length: number): number;
    jsh_decode(engine: NativePointer, length: number): number;
    jsh_encode(engine: NativePointer, handle: number): number;
    jsh_dup(engine: NativePointer, handle: number): number;
    jsh_free(engine: NativePointer, handle: number): void;
    jsh_debug_attach(engine: NativePointer, context: number, pollLines: number): number;
    jsh_debug_detach(engine: NativePointer): void;
    jsh_debug_set_breakpoints(engine: NativePointer, path: string, length: number): number;
    jsh_debug_set_stop_on_exception(engine: NativePointer, stop: number): void;
    jsh_debug_pause(engine: NativePointer): void;
    jsh_debug_resume(engine: NativePointer, mode: number): number;
    jsh_debug_frames(engine: NativePointer): number;
    jsh_debug_scope(engine: NativePointer, frame: number, scope: number): number;
    jsh_debug_exception(engine: NativePointer): number;
    jsh_debug_evaluate(engine: NativePointer, frame: number, source: Uint8Array, length: number): number;
    jsh_debug_describe(engine: NativePointer, handle: number): number;
    jsh_debug_properties(engine: NativePointer, handle: number, start: number, count: number): number;
}

/** The engine's callback: an operation, an id and a byte length in, a length or a status out. */
export type HostCallback = (op: number, id: number, length: number) => number;

/** A bound library, its callbacks, and how to take a pointer to shared memory for it. */
export interface BoundLibrary {
    readonly symbols: NativeSymbols;
    /** Makes a native function pointer that runs `callback` on this thread. */
    registerHostCallback(callback: HostCallback): NativePointer;
    unregisterHostCallback(pointer: NativePointer): void;
    /** The address of a shared buffer's memory, which never moves while the buffer lives. */
    pointerOf(memory: SharedArrayBuffer): NativePointer;
    close(): void;
}

/** The argument and result kinds the interface uses. */
type Kind = 'int32' | 'float64' | 'void' | 'pointer' | 'string' | 'buffer';

const signatures: Record<keyof NativeSymbols, readonly [Kind, readonly Kind[]]> = {
    jsh_abi_version: ['int32', []],
    jsh_engine_create: ['pointer', ['pointer', 'pointer', 'int32', 'float64', 'float64']],
    jsh_engine_destroy: ['void', ['pointer']],
    jsh_context_create: ['int32', ['pointer']],
    jsh_context_select: ['int32', ['pointer', 'int32']],
    jsh_engine_set_buffer: ['void', ['pointer', 'pointer', 'int32']],
    jsh_engine_set_budget: ['void', ['pointer', 'float64', 'float64']],
    jsh_engine_begin_tick: ['void', ['pointer']],
    jsh_engine_stat: ['float64', ['pointer', 'int32']],
    jsh_eval_script: ['int32', ['pointer', 'string', 'buffer', 'int32']],
    jsh_eval_module: ['int32', ['pointer', 'string', 'buffer', 'int32']],
    jsh_run_jobs: ['int32', ['pointer', 'int32']],
    jsh_call: ['int32', ['pointer', 'int32', 'int32', 'int32']],
    jsh_global: ['int32', ['pointer']],
    jsh_get: ['int32', ['pointer', 'int32', 'string']],
    jsh_set: ['int32', ['pointer', 'int32', 'string', 'int32']],
    jsh_host_function: ['int32', ['pointer', 'int32', 'string', 'int32']],
    jsh_decode: ['int32', ['pointer', 'int32']],
    jsh_encode: ['int32', ['pointer', 'int32']],
    jsh_dup: ['int32', ['pointer', 'int32']],
    jsh_free: ['void', ['pointer', 'int32']],
    jsh_debug_attach: ['int32', ['pointer', 'int32', 'float64']],
    jsh_debug_detach: ['void', ['pointer']],
    jsh_debug_set_breakpoints: ['int32', ['pointer', 'string', 'int32']],
    jsh_debug_set_stop_on_exception: ['void', ['pointer', 'int32']],
    jsh_debug_pause: ['void', ['pointer']],
    jsh_debug_resume: ['int32', ['pointer', 'int32']],
    jsh_debug_frames: ['int32', ['pointer']],
    jsh_debug_scope: ['int32', ['pointer', 'int32', 'int32']],
    jsh_debug_exception: ['int32', ['pointer']],
    jsh_debug_evaluate: ['int32', ['pointer', 'int32', 'buffer', 'int32']],
    jsh_debug_describe: ['int32', ['pointer', 'int32']],
    jsh_debug_properties: ['int32', ['pointer', 'int32', 'int32', 'int32']]
};

const hostCallbackSignature = {
    arguments: ['int32', 'int32', 'int32'],
    return: 'int32'
} as const satisfies { arguments: readonly Kind[]; return: Kind };

/** The part of `bun:ffi` this binding uses. */
export interface BunFfi {
    dlopen(
        path: string,
        definitions: Record<string, { args: string[]; returns: string }>
    ): { symbols: Record<string, (...args: unknown[]) => unknown>; close(): void };
    ptr(view: Uint8Array): number;
    JSCallback: new (
        callback: (...args: number[]) => number,
        definition: { args: string[]; returns: string }
    ) => { readonly ptr: number | null; close(): void };
}

const bunKinds: Record<Kind, string> = {
    int32: 'i32',
    float64: 'f64',
    void: 'void',
    pointer: 'ptr',
    string: 'ptr',
    buffer: 'ptr'
};

/**
 * Adapts one `bun:ffi` function to the `node:ffi` calling convention the engine uses. Bun passes
 * pointers as numbers and answers null for a null one, where `node:ffi` uses bigints, and it takes
 * a string argument only as the address of NUL-terminated bytes.
 */
const bunFunction =
    (bound: (...args: unknown[]) => unknown, [result, parameters]: readonly [Kind, readonly Kind[]]) =>
    (...args: unknown[]): unknown => {
        const converted = args.map((argument, index) => {
            const kind = parameters[index];
            if (kind === 'pointer' && typeof argument === 'bigint') return Number(argument);
            if (kind === 'string' && typeof argument === 'string') return Buffer.from(`${argument}\0`, 'utf8');
            return argument;
        });
        const value = bound(...converted);
        if (result !== 'pointer') return value;
        return typeof value === 'number' || typeof value === 'bigint' ? BigInt(value) : 0n;
    };

/** Loads `bun:ffi`, which only Bun has. */
const loadBunFfi = (): BunFfi =>
    // `bun:ffi` has no types in this workspace; BunFfi above is the part this file calls.
    process.getBuiltinModule('bun:ffi' as 'node:fs') as unknown as BunFfi;

/**
 * Opens the library with `bun:ffi`.
 * @param path - The shared library's file.
 * @param bun - The `bun:ffi` module; a parameter so a test under Node.js can pass its own.
 * @returns The bound library.
 */
export const bindBunLibrary = (path: string, bun: BunFfi = loadBunFfi()): BoundLibrary => {
    const opened = bun.dlopen(
        path,
        Object.fromEntries(
            Object.entries(signatures).map(([name, [result, parameters]]) => [
                name,
                { args: parameters.map((kind) => bunKinds[kind]), returns: bunKinds[result] }
            ])
        )
    );
    // `dlopen` refuses a library that lacks a symbol, so every one in `signatures` is bound here.
    const symbols = Object.fromEntries(
        Object.entries(signatures).flatMap(([name, signature]) => {
            const bound = opened.symbols[name];
            return bound === undefined ? [] : [[name, bunFunction(bound, signature)]];
        })
    );
    // A callback lives until it is unregistered, by the pointer the engine was given.
    const callbacks = new Map<bigint, { close(): void }>();
    return {
        // The definitions above name every NativeSymbols member with its C signature.
        symbols: symbols as unknown as NativeSymbols,
        registerHostCallback: (callback) => {
            const registered = new bun.JSCallback(callback, {
                args: hostCallbackSignature.arguments.map((kind) => bunKinds[kind]),
                returns: bunKinds[hostCallbackSignature.return]
            });
            const pointer = BigInt(registered.ptr ?? 0);
            callbacks.set(pointer, registered);
            return pointer;
        },
        unregisterHostCallback: (pointer) => {
            callbacks.get(pointer)?.close();
            callbacks.delete(pointer);
        },
        pointerOf: (memory) => BigInt(bun.ptr(new Uint8Array(memory))),
        close: () => {
            for (const registered of callbacks.values()) registered.close();
            callbacks.clear();
            opened.close();
        }
    };
};

/**
 * Opens the library with the running runtime's FFI.
 * @param path - The shared library's file.
 * @returns The bound library.
 * @throws {NativeLibraryError} When Node.js has no `node:ffi`.
 * @throws {Error} When the library does not load.
 */
export const bindLibrary = (path: string): BoundLibrary => {
    if (process.versions.bun !== undefined) return bindBunLibrary(path);
    const ffi = nodeFfi();
    const opened = ffi.dlopen(
        path,
        Object.fromEntries(
            Object.entries(signatures).map(([name, [result, parameters]]) => [
                name,
                { arguments: parameters, return: result }
            ])
        )
    );
    return {
        // The definitions above name every NativeSymbols member with its C signature.
        symbols: opened.functions as unknown as NativeSymbols,
        registerHostCallback: (callback) => opened.lib.registerCallback(hostCallbackSignature, callback),
        unregisterHostCallback: (pointer) => opened.lib.unregisterCallback(pointer),
        pointerOf: (memory) => ffi.getRawPointer(memory),
        close: () => opened.lib.close()
    };
};
