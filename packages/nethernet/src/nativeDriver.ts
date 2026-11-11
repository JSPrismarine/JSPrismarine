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

/** A {@link PeerConnection} of the native library as a {@link DriverPeer}. */
const peerOf = (peer: PeerConnection): DriverPeer => {
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
        setRemoteDescription: (type, sdp) => peer.setRemoteDescription({ type, sdp }),
        addRemoteCandidate: (candidate, sdpMid) => peer.addRemoteCandidate(candidate, sdpMid),
        createDataChannel: (label, options) => channelOf(peer.createDataChannel(label, options)),
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
        // libdatachannel shows what its own queue holds; once usrsctp has a message, its graceful
        // shutdown on close delivers it (docs/plans/webrtc-backend.md, slice 8).
        hasUndeliveredData: (channel) => channel.bufferedAmount > 0,
        close: () => peer.close()
    };
};

/**
 * The native networking library as a {@link WebRtcDriver}.
 * @param network - The loaded library.
 * @returns The driver.
 */
export const nativeDriver = (network: NativeNetwork): WebRtcDriver => ({
    createPeer: (config: PeerConfig = {}) =>
        peerOf(
            new PeerConnection(network, {
                ...(config.bindAddress === undefined ? {} : { bindAddress: config.bindAddress }),
                ...(config.iceServers === undefined ? {} : { iceServers: config.iceServers }),
                portRangeBegin: config.portRangeBegin ?? 0,
                portRangeEnd: config.portRangeEnd ?? 0,
                enableIceUdpMux: config.enableIceUdpMux ?? false
            })
        )
});

/** The native library could not be loaded, so NetherNet cannot run here. */
export class NetherNetUnavailableError extends Error {
    public override readonly name = 'NetherNetUnavailableError';
}

/**
 * Loads the native library and returns its driver.
 * @returns The driver.
 * @throws {NetherNetUnavailableError} When the library cannot be loaded, with the platform and the cause.
 */
export const loadNativeDriver = async (): Promise<WebRtcDriver> => {
    try {
        return nativeDriver(await NativeNetwork.load());
    } catch (error: unknown) {
        throw new NetherNetUnavailableError(
            `NetherNet's native library cannot load on ${process.platform}-${process.arch}: ${
                error instanceof Error ? error.message : String(error)
            }`,
            { cause: error }
        );
    }
};
