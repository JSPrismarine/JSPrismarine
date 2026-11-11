/**
 * Binds the library's flat C interface (`native/include/jsp_native_network.h`) through the
 * runtime's own FFI: `node:ffi` under Node.js, `bun:ffi` under Bun. Every call is synchronous and
 * nothing calls back, so neither FFI has to carry a call from a foreign thread.
 */

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

/** The part of `node:ffi` this binding uses; Node.js 26 ships no types for it yet. */
interface NodeFfi {
    dlopen(
        path: string,
        definitions: Record<string, { arguments: string[]; return: string }>
    ): { functions: Record<string, (...args: unknown[]) => unknown>; lib: { close(): void } };
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
        // `node:ffi` has no published types; NodeFfi above is the part this file calls.
        return process.getBuiltinModule('node:ffi') as unknown as NodeFfi;
    } finally {
        process.emitWarning = emitWarning;
    }
};

/**
 * Opens the library with the running runtime's FFI.
 * @param path - The shared library's file.
 * @returns The bound library.
 * @throws {Error} When the runtime has no FFI or the library does not load.
 */
export const bindLibrary = (path: string): BoundLibrary => {
    if (process.versions.bun !== undefined) {
        // `bun:ffi` has no types in this workspace; BunFfi above is the part this file calls.
        const bun = process.getBuiltinModule('bun:ffi' as 'node:fs') as unknown as BunFfi;
        const opened = bun.dlopen(
            path,
            Object.fromEntries(
                Object.entries(signatures).map(([name, [result, parameters]]) => [
                    name,
                    { args: parameters.map((kind) => bunKinds[kind]), returns: bunKinds[result] }
                ])
            )
        );
        return {
            // The definitions above name every NativeSymbols member with its C signature.
            symbols: opened.symbols as unknown as NativeSymbols,
            pointerOf: (memory) => bun.ptr(new Uint8Array(memory)),
            close: () => opened.close()
        };
    }

    const node = loadNodeFfi();
    const opened = node.dlopen(
        path,
        Object.fromEntries(
            Object.entries(signatures).map(([name, [result, parameters]]) => [
                name,
                { arguments: parameters.map((kind) => nodeKinds[kind]), return: nodeKinds[result] }
            ])
        )
    );
    return {
        // The definitions above name every NativeSymbols member with its C signature.
        symbols: opened.functions as unknown as NativeSymbols,
        pointerOf: (memory) => node.getRawPointer(memory),
        close: () => opened.lib.close()
    };
};
