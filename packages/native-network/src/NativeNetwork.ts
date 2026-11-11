import dgram from 'node:dgram';

import { bindLibrary } from './ffi';
import type { BoundLibrary, NativeSymbols } from './ffi';
import { NativeLibraryError, locateLibrary } from './library';

/** The interface version this binding speaks; it must equal the library's `JSP_ABI_VERSION`. */
export const ABI_VERSION = 1;

/** Event kinds, as `native/include/jsp_native_network.h` numbers them. */
export const NativeEvent = {
    description: 1,
    candidate: 2,
    state: 3,
    gathering: 4,
    dataChannel: 5,
    open: 6,
    closed: 7,
    error: 8,
    message: 9,
    bufferedLow: 10,
    iceState: 11,
    log: 12
} as const;

/** One event read from the native queue. */
export interface NativeEventRecord {
    readonly kind: number;
    /** The peer connection or data channel the event is about. */
    readonly id: number;
    readonly value: number;
    /** A copy of the payload; it stays valid after the next read. */
    readonly payload: Buffer;
}

/** What receives the events of one peer connection or data channel. */
export type NativeEventHandler = (event: NativeEventRecord) => void;

const EVENT_HEADER_BYTES = 16;
const INITIAL_READ_BYTES = 256 * 1024;

/**
 * Encodes a string for the C interface, NUL-terminated.
 * @param text - The string.
 * @returns Its UTF-8 bytes and a trailing NUL.
 */
export const cString = (text: string): Buffer => Buffer.from(`${text}\0`, 'utf8');

/**
 * The native library, loaded once per thread, and that thread's event queue.
 *
 * The library is mapped once per process, and each thread that loads it opens a queue of its
 * own, so a worker's peer connections report to the worker. libdatachannel's threads queue
 * events in native memory and send one datagram to a loopback socket here when the queue stops
 * being empty. The socket's handler drains the queue and
 * dispatches each event to the handler registered for its id, so every event reaches JavaScript
 * on the event loop, in order, with no call from a foreign thread.
 */
export class NativeNetwork {
    private static instance: NativeNetwork | undefined;

    /** Wake datagrams received; a burst of events costs one. */
    public wakes = 0;

    private readonly handlers = new Map<number, NativeEventHandler>();
    private readBuffer = Buffer.allocUnsafe(INITIAL_READ_BYTES);
    private logHandler: ((level: number, line: string) => void) | undefined;
    /** Things that keep the process alive while they are open, such as a connection being made. */
    private holds = 0;

    private constructor(
        private readonly library: BoundLibrary,
        private readonly wakeSocket: dgram.Socket,
        /** The handle of this thread's event queue, which peer connections are created on. */
        public readonly queue: number
    ) {
        wakeSocket.on('message', () => {
            this.wakes++;
            this.drain();
        });
        wakeSocket.unref();
    }

    /**
     * Loads the library and opens this thread's event queue, the first time it is called on a thread.
     * @param options - The library file and log level; the defaults find the installed build.
     * @returns The loaded library.
     * @throws {NativeLibraryError} When the library cannot be found, loaded, or speaks another interface.
     */
    public static async load(options: { path?: string; logLevel?: number } = {}): Promise<NativeNetwork> {
        if (NativeNetwork.instance !== undefined) return NativeNetwork.instance;
        const path = options.path ?? locateLibrary();
        let library: BoundLibrary;
        try {
            library = bindLibrary(path);
        } catch (error: unknown) {
            throw new NativeLibraryError(
                `The native networking library at ${path} does not load on ${process.platform}-${process.arch}: ${
                    error instanceof Error ? error.message : String(error)
                }`,
                { cause: error }
            );
        }
        const version = library.symbols.jsp_abi_version();
        if (version !== ABI_VERSION) {
            library.close();
            throw new NativeLibraryError(
                `The native networking library at ${path} speaks interface ${version}; this package needs ${ABI_VERSION}`
            );
        }

        const socket = dgram.createSocket('udp4');
        await new Promise<void>((resolve, reject) => {
            socket.once('error', reject);
            socket.bind(0, '127.0.0.1', () => {
                socket.off('error', reject);
                resolve();
            });
        });
        const opened = library.symbols.jsp_events_open(socket.address().port, options.logLevel ?? 0);
        if (opened < 0) {
            socket.close();
            library.close();
            throw new NativeLibraryError(`The native networking library could not open its event queue (${opened})`);
        }
        NativeNetwork.instance = new NativeNetwork(library, socket, opened);
        return NativeNetwork.instance;
    }

    /** The loaded library, or undefined before {@link NativeNetwork.load}. */
    public static loaded(): NativeNetwork | undefined {
        return NativeNetwork.instance;
    }

    /** The bound C interface. */
    public get symbols(): NativeSymbols {
        return this.library.symbols;
    }

    /**
     * The address of shared memory, for an interface call that takes a pointer.
     * @param memory - The memory; it must outlive every native use of the pointer.
     * @returns The pointer.
     */
    public pointerOf(memory: SharedArrayBuffer): bigint | number {
        return this.library.pointerOf(memory);
    }

    /**
     * Sends the events of one id to a handler, until {@link NativeNetwork.unwatch}.
     * @param id - The peer connection or data channel.
     * @param handler - Receives its events in order.
     */
    public watch(id: number, handler: NativeEventHandler): void {
        this.handlers.set(id, handler);
    }

    /**
     * Stops sending an id's events anywhere.
     * @param id - The peer connection or data channel.
     */
    public unwatch(id: number): void {
        this.handlers.delete(id);
    }

    /**
     * Receives libdatachannel's log lines, when the library was loaded with a log level.
     * @param handler - Receives each line and its level.
     */
    public onLog(handler: (level: number, line: string) => void): void {
        this.logHandler = handler;
    }

    /** Keeps the process alive until the matching {@link NativeNetwork.release}. */
    public hold(): void {
        if (this.holds++ === 0) this.wakeSocket.ref();
    }

    /** Lets the process exit once nothing holds it. */
    public release(): void {
        if (this.holds > 0 && --this.holds === 0) this.wakeSocket.unref();
    }

    /** Reads every queued event and dispatches it; a read that finds the queue empty rearms the wake. */
    public drain(): void {
        for (;;) {
            const written = this.symbols.jsp_events_read(this.queue, this.readBuffer, this.readBuffer.byteLength);
            if (written === 0) return;
            if (written < 0) {
                this.readBuffer = Buffer.allocUnsafe(Math.max(-written, this.readBuffer.byteLength * 2));
                continue;
            }
            let offset = 0;
            while (offset < written) {
                const length = this.readBuffer.readUInt32LE(offset);
                const event: NativeEventRecord = {
                    kind: this.readBuffer[offset + 4]!,
                    id: this.readBuffer.readInt32LE(offset + 8),
                    value: this.readBuffer.readInt32LE(offset + 12),
                    payload: Buffer.from(this.readBuffer.subarray(offset + EVENT_HEADER_BYTES, offset + length))
                };
                offset += length;
                this.dispatch(event);
            }
        }
    }

    /**
     * Closes this thread's peer connections and its event queue. The library stays mapped, and
     * another thread's connections and the shared ports are not touched.
     */
    public close(): void {
        this.symbols.jsp_events_close(this.queue);
        this.handlers.clear();
        this.wakeSocket.close();
        NativeNetwork.instance = undefined;
    }

    private dispatch(event: NativeEventRecord): void {
        if (event.kind === NativeEvent.log) {
            this.logHandler?.(event.value, event.payload.toString('utf8'));
            return;
        }
        this.handlers.get(event.id)?.(event);
    }
}
