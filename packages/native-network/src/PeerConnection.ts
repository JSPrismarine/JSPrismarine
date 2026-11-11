import { EventEmitter } from 'node:events';

import { NativeEvent, cString } from './NativeNetwork';
import type { NativeEventRecord, NativeNetwork } from './NativeNetwork';

/** libdatachannel's `rtcState`, a peer connection's state. */
export type PeerConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
/** libdatachannel's `rtcGatheringState`. */
export type GatheringState = 'new' | 'in-progress' | 'complete';
/** libdatachannel's `rtcIceState`. */
export type IceConnectionState = 'new' | 'checking' | 'connected' | 'completed' | 'failed' | 'disconnected' | 'closed';

const connectionStates: readonly PeerConnectionState[] = [
    'new',
    'connecting',
    'connected',
    'disconnected',
    'failed',
    'closed'
];
const gatheringStates: readonly GatheringState[] = ['new', 'in-progress', 'complete'];
const iceStates: readonly IceConnectionState[] = [
    'new',
    'checking',
    'connected',
    'completed',
    'failed',
    'disconnected',
    'closed'
];

/** How a peer connection binds and which ports it may use. */
export interface PeerConnectionOptions {
    /** The local address libjuice binds; every interface when absent. */
    readonly bindAddress?: string;
    /** STUN or TURN servers, as libdatachannel's URLs. */
    readonly iceServers?: readonly string[];
    /** The lowest local UDP port; with `portRangeEnd`, 0 or absent lets the system choose. */
    readonly portRangeBegin?: number;
    readonly portRangeEnd?: number;
    /** Serves every peer connection on a port from one socket, libjuice's mux mode. */
    readonly enableIceUdpMux?: boolean;
    /** The largest message the remote side may send; libdatachannel's default when absent. */
    readonly maxMessageSize?: number;
}

/** Which way a data channel delivers. */
export interface DataChannelOptions {
    /** Delivers in any order. */
    readonly unordered?: boolean;
    /** Gives up on a message after this many retransmissions; reliable when absent. */
    readonly maxRetransmits?: number;
}

/** A selected pair's two candidates, as SDP candidate lines without the `a=` prefix. */
export interface SelectedCandidatePair {
    readonly local: string;
    readonly remote: string;
}

/** A local candidate, as a W3C `RTCIceCandidateInit` carries it. */
export interface LocalCandidate {
    readonly candidate: string;
    readonly sdpMid: string;
}

const ok = (result: number, what: string): number => {
    if (result < 0) throw new Error(`${what} failed (libdatachannel error ${result})`);
    return result;
};

/** libdatachannel's candidate lines carry SDP's `a=` prefix, which the W3C format leaves out. */
const withoutAttributePrefix = (line: string): string => (line.startsWith('a=') ? line.slice(2) : line);

/**
 * A data channel on a native peer connection.
 *
 * Events: `open`, `close`, `error` (Error), `message` (Buffer, binary flag), `bufferedamountlow`.
 */
export class DataChannel extends EventEmitter {
    private state: 'connecting' | 'open' | 'closing' | 'closed';

    /**
     * @param network - The loaded library.
     * @param id - libdatachannel's id for the channel.
     * @param label - The channel's label.
     * @param open - Whether it is open already, as an incoming channel often is.
     */
    public constructor(
        private readonly network: NativeNetwork,
        public readonly id: number,
        public readonly label: string,
        open: boolean
    ) {
        super();
        this.state = open ? 'open' : 'connecting';
        network.watch(id, (event) => this.handle(event));
    }

    /** `connecting`, `open`, `closing` or `closed`, as the W3C `readyState`. */
    public get readyState(): 'connecting' | 'open' | 'closing' | 'closed' {
        return this.state;
    }

    /** Bytes queued in libdatachannel and not yet handed to SCTP. */
    public get bufferedAmount(): number {
        return Math.max(0, this.network.symbols.jsp_dc_buffered_amount(this.id));
    }

    /**
     * Fires `bufferedamountlow` once the buffered amount falls to this many bytes.
     * @param amount - The threshold.
     */
    public setBufferedAmountLowThreshold(amount: number): void {
        this.network.symbols.jsp_dc_set_buffered_amount_low_threshold(this.id, amount);
    }

    /**
     * Sends one message.
     * @param data - The message's bytes.
     * @returns Whether libdatachannel took it; false on a channel that is not open.
     */
    public send(data: Uint8Array): boolean {
        if (this.state !== 'open') return false;
        return this.network.symbols.jsp_dc_send(this.id, data, data.byteLength) >= 0;
    }

    /** Closes the channel; `close` follows, once the stream is reset. */
    public close(): void {
        if (this.state === 'closed' || this.state === 'closing') return;
        this.state = 'closing';
        this.network.symbols.jsp_dc_close(this.id);
    }

    private handle(event: NativeEventRecord): void {
        switch (event.kind) {
            case NativeEvent.open:
                this.state = 'open';
                this.emit('open');
                return;
            case NativeEvent.closed:
                this.state = 'closed';
                this.network.unwatch(this.id);
                this.network.symbols.jsp_dc_delete(this.id);
                this.emit('close');
                return;
            case NativeEvent.error:
                this.emit('error', new Error(event.payload.toString('utf8')));
                return;
            case NativeEvent.message:
                this.emit('message', event.payload, event.value === 1);
                return;
            case NativeEvent.bufferedLow:
                this.emit('bufferedamountlow');
                return;
        }
    }
}

/**
 * A peer connection in the native library.
 *
 * Events: `description` ({ type, sdp }), `candidate` (LocalCandidate), `gatheringstatechange`,
 * `connectionstatechange`, `iceconnectionstatechange`, `datachannel` (DataChannel).
 * libdatachannel negotiates by itself: a remote offer produces the answer, and the first data
 * channel on a new connection produces the offer.
 */
export class PeerConnection extends EventEmitter {
    public connectionState: PeerConnectionState = 'new';
    public iceGatheringState: GatheringState = 'new';
    public iceConnectionState: IceConnectionState = 'new';
    /** The last local description libdatachannel made. */
    public localDescription: { type: 'offer' | 'answer'; sdp: string } | undefined;

    public readonly id: number;
    private readonly channels = new Set<DataChannel>();
    private deleted = false;

    /**
     * @param network - The loaded library.
     * @param options - Binding and ports.
     * @throws {Error} When libdatachannel refuses the configuration.
     */
    public constructor(
        private readonly network: NativeNetwork,
        options: PeerConnectionOptions = {}
    ) {
        super();
        this.id = ok(
            network.symbols.jsp_pc_create(
                network.queue,
                cString(options.bindAddress ?? ''),
                cString((options.iceServers ?? []).join('\n')),
                options.portRangeBegin ?? 0,
                options.portRangeEnd ?? 0,
                options.enableIceUdpMux ? 1 : 0,
                options.maxMessageSize ?? 0
            ),
            'Creating a peer connection'
        );
        network.watch(this.id, (event) => this.handle(event));
        network.hold();
    }

    /**
     * Applies the remote side's description. An offer makes libdatachannel answer.
     * @param description - The description and its type.
     */
    public setRemoteDescription(description: { type: 'offer' | 'answer'; sdp: string }): void {
        ok(
            this.network.symbols.jsp_pc_set_remote_description(
                this.id,
                cString(description.sdp),
                cString(description.type)
            ),
            'Setting the remote description'
        );
    }

    /**
     * Adds a remote candidate.
     * @param candidate - The candidate line, with or without `a=`.
     * @param sdpMid - Its media id; `0` when absent, as a NetherNet offer has one section.
     */
    public addRemoteCandidate(candidate: string, sdpMid = '0'): void {
        ok(
            this.network.symbols.jsp_pc_add_remote_candidate(
                this.id,
                cString(withoutAttributePrefix(candidate)),
                cString(sdpMid)
            ),
            'Adding a remote candidate'
        );
    }

    /**
     * Creates a data channel; on a new connection, that makes libdatachannel produce the offer.
     * @param label - The channel's label.
     * @param options - Ordering and retransmissions.
     * @returns The channel.
     */
    public createDataChannel(label: string, options: DataChannelOptions = {}): DataChannel {
        const id = ok(
            this.network.symbols.jsp_dc_create(
                this.id,
                cString(label),
                options.unordered ? 1 : 0,
                options.maxRetransmits ?? -1
            ),
            'Creating a data channel'
        );
        const channel = new DataChannel(this.network, id, label, false);
        this.track(channel);
        return channel;
    }

    /**
     * The current local description as libdatachannel holds it, with every candidate gathered so
     * far; read it after `gatheringstatechange` reaches `complete` to send one with all of them.
     * @returns The SDP, or undefined before there is one.
     */
    public currentLocalSdp(): string | undefined {
        let buffer = Buffer.alloc(4096);
        for (;;) {
            const written = this.network.symbols.jsp_pc_local_description(this.id, buffer, buffer.byteLength);
            if (written === -4) {
                buffer = Buffer.alloc(buffer.byteLength * 2);
                continue;
            }
            if (written < 0) return undefined;
            // libdatachannel counts the terminating NUL.
            return buffer.subarray(0, Math.max(0, written - 1)).toString('utf8');
        }
    }

    /** The candidate pair ICE selected, once connected. */
    public selectedCandidatePair(): SelectedCandidatePair | undefined {
        const buffer = Buffer.alloc(2048);
        const written = this.network.symbols.jsp_pc_selected_pair(this.id, buffer, buffer.byteLength);
        if (written < 0) return undefined;
        const [local = '', remote = ''] = buffer.subarray(0, written).toString('utf8').split('\0');
        return { local: withoutAttributePrefix(local), remote: withoutAttributePrefix(remote) };
    }

    /** Closes the connection and its channels; the native objects are freed once it reports `closed`. */
    public close(): void {
        if (this.deleted) return;
        for (const channel of this.channels) channel.close();
        this.network.symbols.jsp_pc_close(this.id);
        this.free();
    }

    private track(channel: DataChannel): void {
        this.channels.add(channel);
        channel.once('close', () => this.channels.delete(channel));
    }

    private free(): void {
        if (this.deleted) return;
        this.deleted = true;
        this.network.unwatch(this.id);
        this.network.symbols.jsp_pc_delete(this.id);
        this.network.release();
        if (this.connectionState !== 'closed') {
            this.connectionState = 'closed';
            this.emit('connectionstatechange', 'closed');
        }
    }

    private handle(event: NativeEventRecord): void {
        switch (event.kind) {
            case NativeEvent.description: {
                const description = {
                    type: event.value === 1 ? 'answer' : 'offer',
                    sdp: event.payload.toString('utf8')
                } as const;
                this.localDescription = description;
                this.emit('description', description);
                return;
            }
            case NativeEvent.candidate: {
                const text = event.payload.toString('utf8');
                const newline = text.indexOf('\n');
                this.emit('candidate', {
                    sdpMid: text.slice(0, newline),
                    candidate: withoutAttributePrefix(text.slice(newline + 1))
                } satisfies LocalCandidate);
                return;
            }
            case NativeEvent.gathering:
                this.iceGatheringState = gatheringStates[event.value] ?? 'new';
                this.emit('gatheringstatechange', this.iceGatheringState);
                return;
            case NativeEvent.iceState:
                this.iceConnectionState = iceStates[event.value] ?? 'new';
                this.emit('iceconnectionstatechange', this.iceConnectionState);
                return;
            case NativeEvent.state: {
                const state = connectionStates[event.value] ?? 'new';
                this.connectionState = state;
                this.emit('connectionstatechange', state);
                if (state === 'closed') this.free();
                return;
            }
            case NativeEvent.dataChannel: {
                const open = event.payload[0] === 1;
                const channel = new DataChannel(
                    this.network,
                    event.value,
                    event.payload.subarray(1).toString('utf8'),
                    open
                );
                this.track(channel);
                this.emit('datachannel', channel);
                return;
            }
        }
    }
}
