/**
 * Binds the library's flat C interface (`native/include/jsp_native_network.h`) through the
 * runtime's own FFI, `node:ffi` under Node.js and `bun:ffi` under Bun, with
 * `@jsprismarine/native-library`'s binder. Every call is synchronous and nothing calls back, so
 * neither FFI has to carry a call from a foreign thread.
 */

import { bindNative } from '@jsprismarine/native-library/ffi';
import type { BoundNative, FfiSignature, NativePointer } from '@jsprismarine/native-library/ffi';

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
    /** Missing from a library built before it, which `bindLibrary` still loads. */
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
export type BoundLibrary = BoundNative<NativeSymbols>;

const signatures: { readonly [Name in keyof NativeSymbols]-?: FfiSignature } = {
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

/**
 * Opens the library with the running runtime's FFI.
 * @param path - The shared library's file.
 * @returns The bound library.
 * @throws {NativeLibraryError} When Node.js has no `node:ffi`.
 * @throws {Error} When the library does not load.
 */
export const bindLibrary = (path: string): BoundLibrary => bindNative<NativeSymbols>(path, signatures, optionalSymbols);
