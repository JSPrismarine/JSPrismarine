/**
 * Binds the library's flat C interface (`native/include/jsp_script_host.h`) through `node:ffi`.
 * Every call is synchronous. The engine calls back into JavaScript through one callback per
 * engine, on the thread that created it, while a call into the engine is running.
 */

import { NativeLibraryError } from './library';

/** A native address, as `node:ffi` passes one. */
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

const hostCallbackSignature = { arguments: ['int32', 'int32', 'int32'], return: 'int32' };

/** The part of `node:ffi` this binding uses; Node.js 26 ships no types for it yet. */
interface NodeFfi {
    dlopen(
        path: string,
        definitions: Record<string, { arguments: readonly string[]; return: string }>
    ): {
        functions: Record<string, (...args: unknown[]) => unknown>;
        lib: {
            close(): void;
            registerCallback(
                signature: { arguments: readonly string[]; return: string },
                callback: (...args: number[]) => number
            ): bigint;
            unregisterCallback(pointer: bigint): void;
        };
    };
    getRawPointer(memory: ArrayBufferLike): bigint;
}

/**
 * Loads `node:ffi` without its experimental warning, which would otherwise print on every start.
 * Only that one warning is held back.
 */
const loadNodeFfi = (): NodeFfi => {
    const emitWarning = process.emitWarning;
    // emitWarning is overloaded, and this one function forwards every overload unchanged.
    process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
        const text = typeof warning === 'string' ? warning : warning.message;
        if (text.includes('FFI is an experimental feature')) return;
        Reflect.apply(emitWarning, process, [warning, ...rest]);
    }) as typeof process.emitWarning;
    try {
        const ffi: unknown = process.getBuiltinModule('node:ffi');
        if (ffi === undefined) {
            throw new NativeLibraryError(
                `node:ffi is not available in Node.js ${process.version}. Run a Node.js build with FFI support, without --no-experimental-ffi.`
            );
        }
        // `node:ffi` has no published types; NodeFfi above is the part this file calls.
        return ffi as NodeFfi;
    } finally {
        process.emitWarning = emitWarning;
    }
};

/**
 * Opens the library with `node:ffi`.
 * @param path - The shared library's file.
 * @returns The bound library.
 * @throws {Error} When the runtime has no `node:ffi` or the library does not load.
 */
export const bindLibrary = (path: string): BoundLibrary => {
    const ffi = loadNodeFfi();
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
