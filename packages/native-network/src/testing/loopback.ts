import { once } from 'node:events';

import type { NativeNetwork } from '../NativeNetwork';
import { PeerConnection } from '../PeerConnection';
import type { DataChannel, PeerConnectionOptions } from '../PeerConnection';

/** What a loopback exchange delivered. */
export interface LoopbackResult {
    readonly bytesSent: number;
    readonly bytesReceived: number;
    readonly answererPair: { local: string; remote: string } | undefined;
}

/**
 * Connects an offering peer to an answering one in this process, NetherNet's way: the offerer
 * opens a reliable and an unreliable channel, the answer carries every candidate, and the
 * offerer then sends `messages` messages of `size` bytes on the reliable channel.
 * @param network - The loaded library.
 * @param answerer - The answering peer's options, such as a mux port.
 * @param messages - How many messages to send.
 * @param size - Each message's size.
 * @returns The bytes sent and received, and the answerer's selected pair.
 */
export const runLoopback = async (
    network: NativeNetwork,
    answerer: PeerConnectionOptions,
    messages = 100,
    size = 1000
): Promise<LoopbackResult> => {
    const offering = new PeerConnection(network, { bindAddress: '127.0.0.1' });
    const answering = new PeerConnection(network, { bindAddress: '127.0.0.1', ...answerer });
    try {
        const received = new Promise<number>((resolve) => {
            let bytes = 0;
            answering.on('datachannel', (channel: DataChannel) => {
                if (channel.label !== 'ReliableDataChannel') return;
                channel.on('message', (message: Buffer) => {
                    bytes += message.byteLength;
                    if (bytes >= messages * size) resolve(bytes);
                });
            });
        });
        offering.on('candidate', () => {});
        answering.on('description', (description: { type: 'offer' | 'answer'; sdp: string }) =>
            offering.setRemoteDescription(description)
        );

        const gathered = new Promise<void>((resolve) =>
            offering.on('gatheringstatechange', (state: string) => {
                if (state === 'complete') resolve();
            })
        );
        const reliable = offering.createDataChannel('ReliableDataChannel');
        offering.createDataChannel('UnreliableDataChannel', { unordered: true, maxRetransmits: 0 });
        await gathered;
        answering.setRemoteDescription({ type: 'offer', sdp: offering.currentLocalSdp() ?? '' });
        await once(reliable, 'open');

        const payload = Buffer.alloc(size, 7);
        let sent = 0;
        for (let index = 0; index < messages; index++) {
            if (reliable.send(payload)) sent += size;
        }
        const bytesReceived = await received;
        return { bytesSent: sent, bytesReceived, answererPair: answering.selectedCandidatePair() };
    } finally {
        offering.close();
        answering.close();
    }
};
