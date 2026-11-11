import { createSocket } from 'node:dgram';

import type { RTCPeerConnectionLike } from 'nethernet';
import { Client, Server, SignalStructure, SignalType } from 'nethernet';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { constrainIcePorts } from './constrainIcePorts';
import { isRecord } from './isRecord';
import { adaptPeerConnections } from './peerConnections';

/** A UDP port nothing holds right now. */
const freePort = async (): Promise<number> => {
    const socket = createSocket('udp4');
    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
    const { port } = socket.address();
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    return port;
};

/**
 * Binds `port` and lets it go again.
 * @throws {Error} While something else holds it.
 */
const bindable = async (port: number): Promise<void> => {
    const socket = createSocket('udp4');
    try {
        await new Promise<void>((resolve, reject) => {
            socket.once('error', reject);
            socket.bind(port, resolve);
        });
    } finally {
        socket.close();
    }
};

/** The ports of the candidates in an SDP. */
const candidatePortsOf = (sdp: string): number[] =>
    [...sdp.matchAll(/^a=candidate:\S+ \d+ udp \d+ \S+ (\d+) typ/gim)].map((match) => Number(match[1]));

const cleanups: (() => void)[] = [];

afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A NetherNet server on loopback whose peers take their UDP ports from `start`-`end`. */
const serve = (start: number, end: number): Server => {
    const server = new Server({ host: '127.0.0.1' });
    adaptPeerConnections(server);
    constrainIcePorts(server, { start, end });
    cleanups.push(() => server.close());
    return server;
};

const isPeer = (value: unknown): value is RTCPeerConnectionLike =>
    isRecord(value) && typeof value.createOffer === 'function' && typeof value.addIceCandidate === 'function';

/** A peer connection built from the WebRTC backend a `nethernet` `Client` holds, as it builds its own. */
const clientPeerOf = (client: Client): RTCPeerConnectionLike => {
    const backend: unknown = Reflect.get(client, 'webrtc');
    const Peer = isRecord(backend) ? backend.RTCPeerConnection : undefined;
    if (typeof Peer !== 'function') throw new Error('The client has no WebRTC backend');
    const peer: unknown = Reflect.construct(Peer, [{ iceServers: [] }]);
    if (!isPeer(peer)) throw new Error('The backend built no peer connection');
    return peer;
};

/**
 * Joins `server` as a NetherNet client does, handing the signals over directly.
 * @returns The answer the server sent, once both data channels are open on the server's side.
 */
const join = async (server: Server, connectionId: bigint): Promise<string> => {
    const holder = new Client(server.networkId, '127.0.0.1');
    adaptPeerConnections(holder);
    const peer = clientPeerOf(holder);
    cleanups.push(() => {
        peer.close();
        holder.close();
    });
    peer.createDataChannel('ReliableDataChannel');
    peer.createDataChannel('UnreliableDataChannel', { ordered: false, maxRetransmits: 0 });
    await peer.setLocalDescription(await peer.createOffer());

    const opened = new Promise<void>((resolve) =>
        server.on('openConnection', (connection) => {
            if (connection.address === connectionId) resolve();
        })
    );
    let answered: (sdp: string) => void = () => {};
    const answer = new Promise<string>((resolve) => {
        answered = resolve;
    });
    const candidates: string[] = [];
    let remoteSet = false;
    await server.handleOffer(
        new SignalStructure(SignalType.ConnectRequest, connectionId, peer.localDescription?.sdp ?? '', 0n),
        (signal) => {
            if (signal.type === SignalType.ConnectResponse) {
                void peer.setRemoteDescription({ type: 'answer', sdp: signal.data }).then(async () => {
                    remoteSet = true;
                    for (const candidate of candidates.splice(0)) {
                        await peer.addIceCandidate({ candidate, sdpMid: '0', sdpMLineIndex: 0 });
                    }
                    answered(signal.data);
                });
            } else if (signal.type === SignalType.CandidateAdd) {
                if (remoteSet) void peer.addIceCandidate({ candidate: signal.data, sdpMid: '0', sdpMLineIndex: 0 });
                else candidates.push(signal.data);
            }
        }
    );
    await opened;
    return answer;
};

describe('constrainIcePorts', () => {
    it('serves every player from one UDP port, as Bedrock Dedicated Server does', async () => {
        const port = await freePort();
        const server = serve(port, port);

        const answers = await Promise.all([join(server, 1n), join(server, 2n)]);

        for (const answer of answers) {
            expect(candidatePortsOf(answer).length).toBeGreaterThan(0);
            expect(new Set(candidatePortsOf(answer))).toStrictEqual(new Set([port]));
        }
    });

    it('frees the shared port once its last player leaves, and takes it again for the next', async () => {
        const port = await freePort();
        await join(serve(port, port), 1n);

        for (const cleanup of cleanups.splice(0)) cleanup();
        await vi.waitFor(() => bindable(port));
        const next = serve(port, port);

        expect(new Set(candidatePortsOf(await join(next, 2n)))).toStrictEqual(new Set([port]));
    });
});
