import { NativeNetwork, PeerConnection } from '@jsprismarine/native-network';
import type { DataChannel } from '@jsprismarine/native-network';

import { candidateAddress } from './WebRtcDriver';
import type { DriverChannel, DriverPeer, PeerConfig, PeerState, WebRtcDriver } from './WebRtcDriver';

/** A {@link DataChannel} of the native library as a {@link DriverChannel}. */
const channelOf = (channel: DataChannel): DriverChannel => ({
    label: channel.label,
    get readyState() {
        return channel.readyState;
    },
    get bufferedAmount() {
        return channel.bufferedAmount;
    },
    send: (data) => channel.send(data),
    close: () => channel.close(),
    onOpen: (listener) => {
        channel.on('open', listener);
    },
    onClose: (listener) => {
        channel.on('close', listener);
    },
    onMessage: (listener) => {
        channel.on('message', (data: Buffer) => listener(data));
    }
});

/** A line the native library logged that no failing call claimed. */
export interface NativeLogLine {
    /** libdatachannel's level: 1 fatal, 2 error, 3 warning. */
    readonly level: number;
    /** The line, without the source location libdatachannel puts first. */
    readonly text: string;
}

/** How the native driver reports what the library logs. */
export interface NativeDriverOptions {
    /**
     * Receives the warnings and errors no failing call claimed, such as a connection that fails
     * after it opened. The lines a failing call logged go into its error's message instead.
     */
    readonly log?: (line: NativeLogLine) => void;
}

/** Runs native calls, and explains a failed one with what the library logged while it ran. */
type Explain = <T>(call: () => T) => T;

/** A {@link PeerConnection} of the native library as a {@link DriverPeer}. */
const peerOf = (peer: PeerConnection, explain: Explain): DriverPeer => {
    const gathered = new Promise<string>((resolve, reject) => {
        const settle = (): void => {
            if (peer.iceGatheringState !== 'complete') return;
            const sdp = peer.currentLocalSdp();
            if (sdp === undefined) reject(new Error('The peer gathered its candidates but has no description'));
            else resolve(sdp);
        };
        peer.on('gatheringstatechange', settle);
        peer.on('connectionstatechange', (state: PeerState) => {
            if (state === 'closed' || state === 'failed')
                reject(new Error(`The peer ${state} before it had a description`));
        });
    });
    // A peer closed before anyone asked for its description must not leave a rejection unhandled.
    gathered.catch(() => {});

    return {
        get state() {
            return peer.connectionState;
        },
        setRemoteDescription: (type, sdp) => explain(() => peer.setRemoteDescription({ type, sdp })),
        addRemoteCandidate: (candidate, sdpMid) => explain(() => peer.addRemoteCandidate(candidate, sdpMid)),
        createDataChannel: (label, options) => channelOf(explain(() => peer.createDataChannel(label, options))),
        localDescription: () => gathered,
        onDataChannel: (listener) => {
            peer.on('datachannel', (channel: DataChannel) => listener(channelOf(channel)));
        },
        onStateChange: (listener) => {
            peer.on('connectionstatechange', listener);
        },
        remoteAddress: () => {
            const pair = peer.selectedCandidatePair();
            return pair === undefined ? undefined : candidateAddress(pair.remote);
        },
        localAddress: () => {
            const pair = peer.selectedCandidatePair();
            return pair === undefined ? undefined : candidateAddress(pair.local);
        },
        close: () => peer.close()
    };
};

/**
 * The native networking library as a {@link WebRtcDriver}.
 * @param network - The loaded library.
 * @param options - Where the library's log lines go.
 * @returns The driver.
 */
export const nativeDriver = (network: NativeNetwork, options: NativeDriverOptions = {}): WebRtcDriver => {
    // The lines a failing call logged, while it is being explained.
    let claimed: string[] | undefined;
    network.onLog((level, line) => {
        const text = line.replace(/^\S+@\d+: /, '');
        if (claimed === undefined) options.log?.({ level, text });
        else claimed.push(text);
    });
    /** The error with what the library logged while the failed call ran, when it logged anything. */
    const explained = (error: unknown): unknown => {
        claimed = [];
        let lines: string[];
        try {
            // The library logged on this thread before it returned, so the lines are queued.
            network.flushLog();
        } finally {
            lines = [...new Set(claimed)];
            claimed = undefined;
        }
        if (lines.length === 0 || !(error instanceof Error)) return error;
        return new Error(`${error.message}: ${lines.join('; ')}`, { cause: error });
    };
    const explain: Explain = (call) => {
        try {
            return call();
        } catch (error: unknown) {
            throw explained(error);
        }
    };
    return {
        createPeer: (config: PeerConfig = {}) =>
            peerOf(
                explain(
                    () =>
                        new PeerConnection(network, {
                            ...(config.bindAddress === undefined ? {} : { bindAddress: config.bindAddress }),
                            ...(config.iceServers === undefined ? {} : { iceServers: config.iceServers }),
                            portRangeBegin: config.portRangeBegin ?? 0,
                            portRangeEnd: config.portRangeEnd ?? 0,
                            enableIceUdpMux: config.enableIceUdpMux ?? false
                        })
                ),
                explain
            )
    };
};

/** The native library could not be loaded, so NetherNet cannot run here. */
export class NetherNetUnavailableError extends Error {
    public override readonly name = 'NetherNetUnavailableError';
}

/**
 * Loads the native library and returns its driver.
 * @param options - Where the library's log lines go.
 * @returns The driver.
 * @throws {NetherNetUnavailableError} When the library cannot be loaded, with the platform and the cause.
 */
export const loadNativeDriver = async (options: NativeDriverOptions = {}): Promise<WebRtcDriver> => {
    try {
        return nativeDriver(await NativeNetwork.load(), options);
    } catch (error: unknown) {
        throw new NetherNetUnavailableError(
            `NetherNet's native library cannot load on ${process.platform}-${process.arch}: ${
                error instanceof Error ? error.message : String(error)
            }`,
            { cause: error }
        );
    }
};
