import { EventEmitter } from 'node:events';

import type { DriverChannel, DriverPeer } from './WebRtcDriver';

/** The most payload one data channel message carries; a longer message is split into segments. */
export const SEGMENT_BYTES = 10_000;

/**
 * The longest message: the first byte of each segment counts the segments still to come, so a
 * message has 256 segments at most.
 */
export const MAX_MESSAGE_BYTES = 256 * SEGMENT_BYTES;

/**
 * Splits a message into NetherNet's segments: each is one byte, the number of segments after it,
 * and up to {@link SEGMENT_BYTES} of the message.
 * @param message - The message.
 * @returns The segments, in order.
 * @throws {RangeError} When the message is longer than {@link MAX_MESSAGE_BYTES} or empty.
 */
export const segment = (message: Uint8Array): Buffer[] => {
    if (message.byteLength === 0) throw new RangeError('A NetherNet message cannot be empty');
    if (message.byteLength > MAX_MESSAGE_BYTES) {
        throw new RangeError(`A ${message.byteLength} byte message is longer than NetherNet's ${MAX_MESSAGE_BYTES}`);
    }
    const count = Math.ceil(message.byteLength / SEGMENT_BYTES);
    const segments: Buffer[] = [];
    for (let index = 0; index < count; index++) {
        const part = message.subarray(index * SEGMENT_BYTES, (index + 1) * SEGMENT_BYTES);
        const out = Buffer.allocUnsafe(part.byteLength + 1);
        out[0] = count - 1 - index;
        out.set(part, 1);
        segments.push(out);
    }
    return segments;
};

/** Joins segments back into messages, in the order they arrive on the reliable channel. */
export class Reassembler {
    private remaining = 0;
    private parts: Buffer[] = [];

    /**
     * Adds one segment.
     * @param data - The segment, its count byte first.
     * @returns The whole message once its last segment arrives, else undefined.
     * @throws {Error} When the segment is empty or its count does not follow the last one.
     */
    public push(data: Buffer): Buffer | undefined {
        if (data.byteLength < 2) throw new Error('A NetherNet segment needs a count and at least one byte');
        const left = data[0]!;
        if (this.parts.length > 0 && left !== this.remaining - 1) {
            throw new Error(`A NetherNet segment says ${left} more follow, where ${this.remaining - 1} were due`);
        }
        this.remaining = left;
        this.parts.push(data.subarray(1));
        if (left > 0) return undefined;
        const message = this.parts.length === 1 ? this.parts[0]! : Buffer.concat(this.parts);
        this.parts = [];
        return message;
    }
}

/**
 * One NetherNet connection: a peer connection with its reliable and unreliable channels.
 * Messages go out on the reliable channel, segmented, and are queued until it opens.
 *
 * Events: `message` (Buffer), `close` (reason).
 */
export class Connection extends EventEmitter {
    public reliable: DriverChannel | undefined;
    public unreliable: DriverChannel | undefined;
    private closedReason: string | undefined;
    private readonly reassembler = new Reassembler();
    private readonly queue: Uint8Array[] = [];

    /**
     * @param id - The connection ID the client picked.
     * @param peer - The peer connection underneath.
     */
    public constructor(
        public readonly id: bigint,
        public readonly peer: DriverPeer
    ) {
        super();
    }

    /** Whether the connection has closed; nothing more is sent or received. */
    public get closed(): boolean {
        return this.closedReason !== undefined;
    }

    /**
     * Takes the reliable channel, whose messages are the connection's.
     * @param channel - The `ReliableDataChannel`.
     */
    public setReliable(channel: DriverChannel): void {
        this.reliable = channel;
        channel.onMessage((data) => {
            if (this.closed) return;
            let message: Buffer | undefined;
            try {
                message = this.reassembler.push(data);
            } catch (error: unknown) {
                this.close(`badsegment:${error instanceof Error ? error.message : String(error)}`);
                return;
            }
            if (message !== undefined) this.emit('message', message);
        });
        channel.onOpen(() => this.flush());
        channel.onClose(() => this.close('disconnected'));
        if (channel.readyState === 'open') this.flush();
    }

    /**
     * Takes the unreliable channel, which NetherNet opens and leaves unused.
     * @param channel - The `UnreliableDataChannel`.
     */
    public setUnreliable(channel: DriverChannel): void {
        this.unreliable = channel;
        channel.onClose(() => this.close('disconnected'));
    }

    /**
     * Sends one message, or queues it until the reliable channel opens.
     * @param message - The message.
     * @returns The bytes sent or queued.
     * @throws {Error} When the connection has closed.
     */
    public send(message: Uint8Array): number {
        if (this.closed) throw new Error('The NetherNet connection is closed');
        const reliable = this.reliable;
        if (reliable === undefined || reliable.readyState === 'connecting') {
            this.queue.push(message);
            return message.byteLength;
        }
        for (const part of segment(message)) reliable.send(part);
        return message.byteLength;
    }

    /** Whether the reliable channel still holds data the other side has not received, when the driver can tell. */
    public hasUndeliveredData(): boolean | undefined {
        return this.reliable === undefined ? undefined : this.peer.hasUndeliveredData(this.reliable);
    }

    /**
     * Closes the channels and the peer connection.
     * @param reason - Why, which `close` carries.
     */
    public close(reason = 'closed'): void {
        if (this.closed) return;
        this.closedReason = reason;
        this.queue.length = 0;
        this.reliable?.close();
        this.unreliable?.close();
        this.peer.close();
        this.emit('close', reason);
    }

    private flush(): void {
        const reliable = this.reliable;
        if (reliable === undefined) return;
        while (this.queue.length > 0 && !this.closed) {
            for (const part of segment(this.queue.shift()!)) reliable.send(part);
        }
    }
}
