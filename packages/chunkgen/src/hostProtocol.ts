/**
 * The messages between the server and the generation host, and the encoding that lets a setup
 * value containing shared memory cross a process boundary.
 */
import type { GenerationPoolOptions, GenerationPriority, GenerationTask } from './GenerationPool';
import type { WorkerTaskStats } from './GenerationStats';

/** The part of {@link GenerationPoolOptions} that can cross a process boundary. */
export interface HostPoolOptions {
    readonly pipeline: string;
    readonly worker?: string;
    readonly workers: number;
    readonly inFlight?: number;
    /** The pool's setup with its shared buffers passed through {@link encodeShared}. */
    readonly setup?: unknown;
}

/** What the server sends the host. */
export type HostCommand =
    | { readonly type: 'init'; readonly options: HostPoolOptions }
    | {
          readonly type: 'run';
          readonly id: number;
          readonly task: GenerationTask;
          readonly priority: GenerationPriority;
      }
    | { readonly type: 'cancel'; readonly ids: readonly number[] }
    | { readonly type: 'promote'; readonly ids: readonly number[]; readonly to: GenerationPriority }
    | { readonly type: 'limit'; readonly limit: number | undefined }
    | { readonly type: 'destroy' };

/** What the host sends the server. */
export type HostEvent =
    | { readonly type: 'ready' }
    | {
          readonly type: 'result';
          readonly id: number;
          readonly ok: true;
          readonly result: {
              readonly payload: unknown;
              readonly transferList: readonly ArrayBuffer[];
              readonly workerStats?: WorkerTaskStats;
          };
      }
    | {
          readonly type: 'result';
          readonly id: number;
          readonly ok: false;
          readonly error: { readonly name: string; readonly message: string; readonly stack?: string };
      };

/** A shared buffer in transit: its bytes, which the receiving side puts back into shared memory. */
interface SharedBytes {
    readonly __sharedBytes: Uint8Array;
}

const isSharedBytes = (value: unknown): value is SharedBytes =>
    typeof value === 'object' &&
    value !== null &&
    '__sharedBytes' in value &&
    value.__sharedBytes instanceof Uint8Array;

/**
 * Replaces every `SharedArrayBuffer` in a value with a copy of its bytes.
 *
 * Shared memory cannot be sent to another process. The value may nest buffers in plain objects,
 * arrays and maps, which is what a pipeline's setup looks like. Anything else passes through.
 */
export const encodeShared = (value: unknown): unknown => {
    if (value instanceof SharedArrayBuffer)
        return { __sharedBytes: new Uint8Array(value.slice(0)) } satisfies SharedBytes;
    if (Array.isArray(value)) return value.map(encodeShared);
    if (value instanceof Map) return new Map([...value].map(([key, entry]) => [key, encodeShared(entry)]));
    if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encodeShared(entry)]));
    }

    return value;
};

/** The inverse of {@link encodeShared}: puts each copied buffer back into shared memory. */
export const decodeShared = (value: unknown): unknown => {
    if (isSharedBytes(value)) {
        const shared = new SharedArrayBuffer(value.__sharedBytes.byteLength);
        new Uint8Array(shared).set(value.__sharedBytes);
        return shared;
    }
    if (Array.isArray(value)) return value.map(decodeShared);
    if (value instanceof Map) return new Map([...value].map(([key, entry]) => [key, decodeShared(entry)]));
    if (typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decodeShared(entry)]));
    }

    return value;
};
