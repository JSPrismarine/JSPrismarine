/**
 * Binds the library's flat C interface (`native/include/jsp_native_network.h`) through the
 * runtime's own FFI: `node:ffi` under Node.js, `bun:ffi` under Bun. Every call is synchronous and
 * nothing calls back, so neither FFI has to carry a call from a foreign thread.
 */

import { NativeNetworkErrors } from '@jsprismarine/errors/native-network';

/** A pointer the FFI hands to native code: a bigint under Node.js, a number under Bun. */
export type NativePointer = bigint | number;

/** The C interface, one method per exported function. Strings are NUL-terminated buffers. */
export interface NativeSymbols {
    jsp_abi_version(): number;
    jsp_events_open(wakePort: number, logLevel: number): number;
    jsp_events_read(queue: number, buffer: Uint8Array, size: number): number;
    jsp_events_close(queue: number): void;
    jsp_cleanup(): void;
    jsp_classify(data: Uint8Array, size: number): number;
    jsp_pc_create(
        queue: number,
        bindAddress: Uint8Array,
        iceServers: Uint8Array,
        portBegin: number,
        portEnd: number,
        enableIceUdpMux: number,
        maxMessageSize: number
    ): number;
    jsp_pc_set_remote_description(pc: number, sdp: Uint8Array, type: Uint8Array): number;
    jsp_pc_set_local_description(pc: number, type: Uint8Array): number;
    jsp_pc_add_remote_candidate(pc: number, candidate: Uint8Array, mid: Uint8Array): number;
    jsp_pc_local_description(pc: number, buffer: Uint8Array, size: number): number;
    jsp_pc_selected_pair(pc: number, buffer: Uint8Array, size: number): number;
    /** Missing from a library built before it, which {@link bindLibrary} still loads. */
    jsp_pc_round_trip_time?(pc: number): number;
    jsp_pc_close(pc: number): number;
    jsp_pc_delete(pc: number): number;
    jsp_dc_create(pc: number, label: Uint8Array, unordered: number, maxRetransmits: number): number;
    jsp_dc_send(dc: number, data: Uint8Array, size: number): number;
    jsp_dc_buffered_amount(dc: number): number;
    jsp_dc_set_buffered_amount_low_threshold(dc: number, amount: number): number;
    jsp_dc_close(dc: number): number;
    jsp_dc_delete(dc: number): number;
    jsp_mux_open(bindAddress: Uint8Array, port: number): number;
    jsp_mux_attach(
        handle: number,
        family: number,
        inbound: NativePointer,
        inboundSize: number,
        outbound: NativePointer,
        outboundSize: number,
        wakePort: number
    ): number;
    jsp_mux_detach(handle: number, family: number): number;
    jsp_mux_close(handle: number): number;
    jsp_mux_stats(handle: number, out: Uint8Array, count: number): number;
}

/** A bound library, and how to take a pointer to shared memory for it. */
export interface BoundLibrary {
    readonly symbols: NativeSymbols;
    /** The address of a shared buffer's memory, which never moves while the buffer lives. */
    pointerOf(memory: SharedArrayBuffer): NativePointer;
    close(): void;
}

/** The argument and result kinds the interface uses, named once for both FFIs. */
type Kind = 'i32' | 'void' | 'buffer' | 'pointer';

const signatures: Record<keyof NativeSymbols, readonly [Kind, readonly Kind[]]> = {
    jsp_abi_version: ['i32', []],
    jsp_events_open: ['i32', ['i32', 'i32']],
    jsp_events_read: ['i32', ['i32', 'buffer', 'i32']],
    jsp_events_close: ['void', ['i32']],
    jsp_cleanup: ['void', []],
    jsp_classify: ['i32', ['buffer', 'i32']],
    jsp_pc_create: ['i32', ['i32', 'buffer', 'buffer', 'i32', 'i32', 'i32', 'i32']],
    jsp_pc_set_remote_description: ['i32', ['i32', 'buffer', 'buffer']],
    jsp_pc_set_local_description: ['i32', ['i32', 'buffer']],
    jsp_pc_add_remote_candidate: ['i32', ['i32', 'buffer', 'buffer']],
    jsp_pc_local_description: ['i32', ['i32', 'buffer', 'i32']],
    jsp_pc_selected_pair: ['i32', ['i32', 'buffer', 'i32']],
    jsp_pc_round_trip_time: ['i32', ['i32']],
    jsp_pc_close: ['i32', ['i32']],
    jsp_pc_delete: ['i32', ['i32']],
    jsp_dc_create: ['i32', ['i32', 'buffer', 'i32', 'i32']],
    jsp_dc_send: ['i32', ['i32', 'buffer', 'i32']],
    jsp_dc_buffered_amount: ['i32', ['i32']],
    jsp_dc_set_buffered_amount_low_threshold: ['i32', ['i32', 'i32']],
    jsp_dc_close: ['i32', ['i32']],
    jsp_dc_delete: ['i32', ['i32']],
    jsp_mux_open: ['i32', ['buffer', 'i32']],
    jsp_mux_attach: ['i32', ['i32', 'i32', 'pointer', 'i32', 'pointer', 'i32', 'i32']],
    jsp_mux_detach: ['i32', ['i32', 'i32']],
    jsp_mux_close: ['i32', ['i32']],
    jsp_mux_stats: ['i32', ['i32', 'buffer', 'i32']]
};

/**
 * Symbols a library built from older sources lacks. Such a build stays loadable, because an
 * install keeps the published one until the manifest points at a newer one, and the binding
 * leaves each symbol it lacks undefined.
 */
const optionalSymbols: ReadonlySet<string> = new Set(['jsp_pc_round_trip_time'] satisfies (keyof NativeSymbols)[]);

const requiredSignatures = Object.entries(signatures).filter(([name]) => !optionalSymbols.has(name));
const optionalSignatures = Object.entries(signatures).filter(([name]) => optionalSymbols.has(name));

/** The part of `node:ffi` this binding uses; Node.js 26 ships no types for it yet. */
export interface NodeFfi {
    dlopen(
        path: string,
        definitions: Record<string, { arguments: string[]; return: string }>
    ): {
        functions: Record<string, (...args: unknown[]) => unknown>;
        lib: {
            close(): void;
            /** Binds one more symbol; throws when the library does not export it. */
            getFunction(
                name: string,
                definition: { arguments: string[]; return: string }
            ): (...args: unknown[]) => unknown;
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

const nodeKinds: Record<Kind, string> = { i32: 'int32', void: 'void', buffer: 'buffer', pointer: 'pointer' };
const bunKinds: Record<Kind, string> = { i32: 'i32', void: 'void', buffer: 'ptr', pointer: 'ptr' };

/**
 * The `node:ffi` module as this file calls it.
 *
 * `process.getBuiltinModule` answers undefined on a Node.js built without FFI or started with
 * `--no-experimental-ffi`, which would otherwise fail later at `dlopen` with a TypeError that
 * names nothing.
 * @param ffi - What the runtime answered for `node:ffi`.
 * @param version - The running Node.js version, for the message.
 * @throws {NativeLibraryError} When the runtime has no `node:ffi`.
 */
export const nodeFfiOf = (ffi: unknown, version: string): NodeFfi => {
    if (ffi === undefined) throw new NativeNetworkErrors.FfiUnavailable({ version });
    // `node:ffi` has no published types; NodeFfi above is the part this file calls.
    return ffi as NodeFfi;
};

/**
 * Loads `node:ffi` without its experimental warning, which would otherwise print on every start.
 * Only that one warning is held back.
 */
const loadNodeFfi = (): NodeFfi => {
    const emitWarning = process.emitWarning;
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
 * Opens the library with the running runtime's FFI.
 * @param path - The shared library's file.
 * @returns The bound library.
 * @throws {NativeLibraryError} When Node.js has no `node:ffi`.
 * @throws {Error} When the library does not load.
 */
export const bindLibrary = (path: string): BoundLibrary => {
    if (process.versions.bun !== undefined) {
        // `bun:ffi` has no types in this workspace; BunFfi above is the part this file calls.
        const bun = process.getBuiltinModule('bun:ffi' as 'node:fs') as unknown as BunFfi;
        const definitionOf = ([result, parameters]: readonly [Kind, readonly Kind[]]) => ({
            args: parameters.map((kind) => bunKinds[kind]),
            returns: bunKinds[result]
        });
        const opened = bun.dlopen(
            path,
            Object.fromEntries(requiredSignatures.map(([name, signature]) => [name, definitionOf(signature)]))
        );
        const symbols = { ...opened.symbols };
        // `bun:ffi` binds symbols only through `dlopen`, which refuses a missing one, so each
        // optional symbol opens the library once more.
        const extra: { close(): void }[] = [];
        for (const [name, signature] of optionalSignatures) {
            try {
                const one = bun.dlopen(path, { [name]: definitionOf(signature) });
                extra.push(one);
                const bound = one.symbols[name];
                if (bound !== undefined) symbols[name] = bound;
            } catch {
                // A build from before the symbol: it stays undefined.
            }
        }
        return {
            // The definitions above name every NativeSymbols member with its C signature.
            symbols: symbols as unknown as NativeSymbols,
            pointerOf: (memory) => bun.ptr(new Uint8Array(memory)),
            close: () => {
                for (const one of extra) one.close();
                opened.close();
            }
        };
    }

    const node = loadNodeFfi();
    const definitionOf = ([result, parameters]: readonly [Kind, readonly Kind[]]) => ({
        arguments: parameters.map((kind) => nodeKinds[kind]),
        return: nodeKinds[result]
    });
    const opened = node.dlopen(
        path,
        Object.fromEntries(requiredSignatures.map(([name, signature]) => [name, definitionOf(signature)]))
    );
    const functions = { ...opened.functions };
    for (const [name, signature] of optionalSignatures) {
        try {
            functions[name] = opened.lib.getFunction(name, definitionOf(signature));
        } catch {
            // A build from before the symbol: it stays undefined.
        }
    }
    return {
        // The definitions above name every NativeSymbols member with its C signature.
        symbols: functions as unknown as NativeSymbols,
        pointerOf: (memory) => node.getRawPointer(memory),
        close: () => opened.lib.close()
    };
};
