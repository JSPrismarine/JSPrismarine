import { EventEmitter } from 'node:events';

import { provesKey } from './NetherNetIdentity';
import type { IdentityProof } from './NetherNetIdentity';
import type { DriverChannel, DriverPeer, PeerState } from './WebRtcDriver';
import { NethernetErrors } from '@jsprismarine/errors/nethernet';

/**
 * The most payload one data channel message carries, as Bedrock sends it: its `a=max-message-size`
 * of 262144 less the count byte. A longer message is split into segments, and a remote
 * description that allows less lowers it for that connection.
 */
export const SEGMENT_BYTES = 262_143;

/** The most segments Bedrock splits one message into. */
export const MAX_SEGMENTS = 255;

/** The longest message Bedrock sends: {@link MAX_SEGMENTS} full segments. */
export const MAX_MESSAGE_BYTES = MAX_SEGMENTS * SEGMENT_BYTES;

/** What a description without `a=max-message-size` allows (RFC 8841 section 6.1). */
const UNSTATED_MAX_MESSAGE_SIZE = 65_536;

/**
 * How many bytes of a reliable channel's data may wait in the WebRTC stack before the connection
 * is given up as too slow. A join's chunks are a few megabytes; a peer that falls this far behind
 * is not reading, and the queue would otherwise grow until memory runs out.
 */
export const DEFAULT_MAX_BUFFERED_BYTES = 64 * 1024 * 1024;

/**
 * How long a connection whose peer connection went down waits for its reliable channel to report
 * its own close, which comes after the channel's last messages.
 */
export const PEER_END_GRACE_MS = 2_000;

/**
 * How long a peer connection may stay `disconnected` before the connection is given up. WebRTC
 * reports `disconnected` once a few consent checks go unanswered, and the peer comes back to
 * `connected` when they are answered again. A phone that puts the game in the background stops
 * answering for as long as it stays there, so a connection closed at the first `disconnected`
 * dropped every player who opened their notifications. Thirty seconds is the consent timeout
 * RFC 7675 gives, after which WebRTC itself calls the peer `failed`.
 */
export const PEER_RECOVERY_MS = 30_000;

/**
 * The payload one segment may carry to a peer: what its description's `a=max-message-size`
 * allows, less the count byte, and never more than {@link SEGMENT_BYTES}.
 * @param description - The remote SDP description.
 * @returns The segment size to send with.
 */
export const segmentBytesFor = (description: string): number => {
    const stated = /^a=max-message-size:(\d+)\s*$/m.exec(description)?.[1];
    // Zero means the peer takes a message of any size.
    const limit = stated === undefined ? UNSTATED_MAX_MESSAGE_SIZE : Number(stated) || Number.POSITIVE_INFINITY;
    return Math.max(1, Math.min(SEGMENT_BYTES, limit - 1));
};

/**
 * Splits a message into NetherNet's segments: each is one byte, the number of segments after it,
 * and up to `segmentBytes` of the message.
 * @param message - The message.
 * @param segmentBytes - The most payload one segment carries.
 * @returns The segments, in order.
 * @throws {RangeError} When the message is empty or needs more than {@link MAX_SEGMENTS} segments.
 */
export const segment = (message: Uint8Array, segmentBytes = SEGMENT_BYTES): Buffer[] => {
    if (message.byteLength === 0) throw new NethernetErrors.MessageCannotBeEmpty();
    const count = Math.ceil(message.byteLength / segmentBytes);
    if (count > MAX_SEGMENTS) {
        throw new NethernetErrors.MessageTooLongToSegment({
            byteLength: message.byteLength,
            maxSegments: MAX_SEGMENTS,
            segmentBytes
        });
    }
    const segments: Buffer[] = [];
    for (let index = 0; index < count; index++) {
        const part = message.subarray(index * segmentBytes, (index + 1) * segmentBytes);
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
    private bytes = 0;

    /**
     * @param maxBytes - The longest message accepted, so a peer cannot make this hold more.
     */
    public constructor(private readonly maxBytes = MAX_MESSAGE_BYTES) {}

    /**
     * Adds one segment.
     * @param data - The segment, its count byte first.
     * @returns The whole message once its last segment arrives, else undefined.
     * @throws {Error} When the segment is empty, its count does not follow the last one, or the
     *   message grows past the limit.
     */
    public push(data: Buffer): Buffer | undefined {
        if (data.byteLength < 2) throw new NethernetErrors.EmptySegment();
        const left = data[0]!;
        if (this.parts.length > 0 && left !== this.remaining - 1) {
            throw new NethernetErrors.SegmentOutOfSequence({ left, value: this.remaining - 1 });
        }
        this.bytes += data.byteLength - 1;
        if (this.bytes > this.maxBytes) {
            throw new NethernetErrors.MessageTooLarge({ maxBytes: this.maxBytes });
        }
        this.remaining = left;
        this.parts.push(data.subarray(1));
        if (left > 0) return undefined;
        const message = this.parts.length === 1 ? this.parts[0]! : Buffer.concat(this.parts);
        this.parts = [];
        this.bytes = 0;
        return message;
    }
}

/** The limits of one {@link Connection}. */
export interface ConnectionOptions {
    /** The longest message accepted from the peer; {@link MAX_MESSAGE_BYTES} when absent. */
    readonly maxMessageBytes?: number;
    /** How much sent data may wait in the WebRTC stack; {@link DEFAULT_MAX_BUFFERED_BYTES} when absent. */
    readonly maxBufferedBytes?: number;
}

/**
 * One NetherNet connection: a peer connection with its reliable and unreliable channels.
 * Messages go out on the reliable channel, segmented, and are queued until it opens. Messages
 * arrive on either channel: whole on the unreliable one, which carries no segments.
 *
 * Events: `message` (Buffer), `close` (reason).
 */
export class Connection extends EventEmitter {
    public reliable: DriverChannel | undefined;
    public unreliable: DriverChannel | undefined;
    private closedReason: string | undefined;
    /** What the peer's description offered as proof of its key, when it carried an identity. */
    public identityProof: IdentityProof | undefined;
    private readonly reassembler: Reassembler;
    private readonly maxBufferedBytes: number;
    private readonly queue: Uint8Array[] = [];
    private segmentBytes = SEGMENT_BYTES;
    private endTimer: NodeJS.Timeout | undefined;
    private recoveryTimer: NodeJS.Timeout | undefined;

    /**
     * @param id - The connection ID the client picked.
     * @param peer - The peer connection underneath.
     * @param options - How much the connection accepts and buffers.
     */
    public constructor(
        public readonly id: bigint,
        public readonly peer: DriverPeer,
        options: ConnectionOptions = {}
    ) {
        super();
        this.reassembler = new Reassembler(options.maxMessageBytes);
        this.maxBufferedBytes = options.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
    }

    /**
     * Whether the peer proved it holds a key: its description's identity signed the fingerprint
     * of the certificate this connection's DTLS handshake checked, with that key.
     * @param publicKey - The key, as base64 DER.
     * @returns False when it did not, or sent no identity.
     */
    public async provesKey(publicKey: string): Promise<boolean> {
        return this.identityProof !== undefined && (await provesKey(this.identityProof, publicKey));
    }

    /**
     * Sizes outgoing segments to what the peer's description allows.
     * @param description - The remote SDP description.
     */
    public useRemoteDescription(description: string): void {
        this.segmentBytes = segmentBytesFor(description);
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
     * Takes the unreliable channel. Nothing is sent on it, and a message the peer sends there is
     * delivered like any other: it is whole, since the channel carries no segments.
     * @param channel - The `UnreliableDataChannel`.
     */
    public setUnreliable(channel: DriverChannel): void {
        this.unreliable = channel;
        channel.onMessage((data) => {
            if (this.closed) return;
            if (data.byteLength < 2 || data[0] !== 0) {
                this.close('badsegment:A NetherNet message on the unreliable channel must be one segment');
                return;
            }
            this.emit('message', data.subarray(1));
        });
        // Its close is not ordered with the reliable channel's data, so it ends the connection
        // the way the peer connection going down does.
        channel.onClose(() => this.peerEnded('disconnected'));
    }

    /**
     * Sends one message, or queues it until the reliable channel opens.
     * @param message - The message.
     * @returns The bytes sent or queued.
     * @throws {Error} When the connection has closed.
     * @throws {RangeError} When the message is empty or too long to segment.
     */
    public send(message: Uint8Array): number {
        if (this.closed) throw new NethernetErrors.ConnectionIsClosed();
        const reliable = this.reliable;
        if (reliable === undefined || reliable.readyState === 'connecting') {
            this.queue.push(message);
            return message.byteLength;
        }
        this.sendNow(reliable, message);
        return message.byteLength;
    }

    /**
     * Follows the peer connection's state. `failed` and `closed` end the connection. `disconnected`
     * ends it only when the peer stays that way for {@link PEER_RECOVERY_MS}, since a peer whose
     * consent checks lapse for a moment recovers to `connected` by itself.
     * @param state - The peer connection's new state.
     */
    public peerStateChanged(state: PeerState): void {
        if (this.closed) return;
        if (state === 'disconnected') {
            if (this.recoveryTimer !== undefined) return;
            this.recoveryTimer = setTimeout(() => {
                this.recoveryTimer = undefined;
                this.peerEnded('disconnected');
            }, PEER_RECOVERY_MS);
            this.recoveryTimer.unref();
            return;
        }
        clearTimeout(this.recoveryTimer);
        this.recoveryTimer = undefined;
        if (state === 'failed' || state === 'closed') this.peerEnded('disconnected');
    }

    /**
     * Ends the connection because the peer connection went down. The reliable channel's close is
     * ordered behind the data on it, and the peer connection's state is not: it can be reported
     * before the channel's last messages. So an open reliable channel is left to close by itself,
     * which delivers what came before; the fallback only covers a channel that never reports it.
     * @param reason - Why, which `close` carries.
     */
    public peerEnded(reason = 'disconnected'): void {
        if (this.closed) return;
        if (this.reliable?.readyState !== 'open') {
            this.close(reason);
            return;
        }
        if (this.endTimer !== undefined) return;
        this.endTimer = setTimeout(() => this.close(reason), PEER_END_GRACE_MS);
        this.endTimer.unref();
    }

    /**
     * Closes the channels and the peer connection.
     * @param reason - Why, which `close` carries.
     */
    public close(reason = 'closed'): void {
        if (this.closed) return;
        this.closedReason = reason;
        clearTimeout(this.endTimer);
        clearTimeout(this.recoveryTimer);
        this.queue.length = 0;
        this.reliable?.close();
        this.unreliable?.close();
        this.peer.close();
        this.emit('close', reason);
    }

    private flush(): void {
        const reliable = this.reliable;
        if (reliable === undefined) return;
        while (this.queue.length > 0 && !this.closed) this.sendNow(reliable, this.queue.shift()!);
    }

    /**
     * Sends a message's segments. A segment the channel refuses leaves the stream short of one,
     * which the peer cannot recover from, so the connection ends; so does one whose peer has
     * fallen further behind than the buffer allows.
     */
    private sendNow(reliable: DriverChannel, message: Uint8Array): void {
        for (const part of segment(message, this.segmentBytes)) {
            if (reliable.send(part)) continue;
            this.close('sendfailed');
            return;
        }
        if (reliable.bufferedAmount > this.maxBufferedBytes) this.close('sendbacklog');
    }
}
