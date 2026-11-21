import { createSocket } from 'node:dgram';
import type { RemoteInfo, Socket } from 'node:dgram';
import { once } from 'node:events';
import { crc32 } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';

import { PeerConnection } from './PeerConnection';
import type { DataChannel, PeerConnectionState } from './PeerConnection';
import { loadNative, nativeLibraryAvailable } from './testing/native.test.helper';

const MAGIC_COOKIE = 0x2112a442;
const BINDING_SUCCESS = 0x0101;
const BINDING_ERROR = 0x0111;

/** Whether a datagram is a STUN message of the given type. */
const isStun = (datagram: Buffer, type: number): boolean =>
    datagram.byteLength >= 20 && datagram.readUInt16BE(0) === type && datagram.readUInt32BE(4) === MAGIC_COOKIE;

/**
 * A Binding error response with code 401 and no MESSAGE-INTEGRITY, for the transaction of the
 * response given: the 48 bytes Bedrock Dedicated Server sends from the agent a check was not for.
 */
const unauthorizedFor = (response: Buffer): Buffer => {
    const reason = Buffer.from('Unauthorized');
    const message = Buffer.alloc(20 + 4 + 4 + reason.byteLength + 8);
    message.writeUInt16BE(BINDING_ERROR, 0);
    message.writeUInt16BE(message.byteLength - 20, 2);
    response.copy(message, 4, 4, 20);
    message.writeUInt16BE(0x0009, 20);
    message.writeUInt16BE(4 + reason.byteLength, 22);
    message.writeUInt8(4, 26);
    message.writeUInt8(1, 27);
    reason.copy(message, 28);
    const fingerprint = 28 + reason.byteLength;
    message.writeUInt16BE(0x8028, fingerprint);
    message.writeUInt16BE(4, fingerprint + 2);
    message.writeUInt32BE((crc32(message.subarray(0, fingerprint)) ^ 0x5354554e) >>> 0, fingerprint + 4);
    return message;
};

const bind = async (): Promise<Socket> => {
    const socket = createSocket('udp4');
    socket.bind(0, '127.0.0.1');
    await once(socket, 'listening');
    return socket;
};

/**
 * Two sockets between an offering and an answering peer. The answerer reaches the offerer through
 * `toOfferer`, and the offerer reaches the answerer through `toAnswerer`. Each Binding success
 * response the answerer sends goes on to the offerer, followed by a 401 for the same transaction.
 */
const strayErrorRelay = async (offerer: { address: string; port: number }) => {
    const toOfferer = await bind();
    const toAnswerer = await bind();
    let answerer: RemoteInfo | undefined;
    const relay = { toOfferer, toAnswerer, unauthorizedSent: 0 };
    toOfferer.on('message', (datagram: Buffer, from: RemoteInfo) => {
        answerer = from;
        toAnswerer.send(datagram, offerer.port, offerer.address);
        if (!isStun(datagram, BINDING_SUCCESS)) return;
        toAnswerer.send(unauthorizedFor(datagram), offerer.port, offerer.address);
        relay.unauthorizedSent++;
    });
    toAnswerer.on('message', (datagram: Buffer) => {
        if (answerer !== undefined) toOfferer.send(datagram, answerer.port, answerer.address);
    });
    return relay;
};

/** The offer with its candidates replaced by one at the given loopback port. */
const candidateAt = (sdp: string, port: number): string =>
    sdp
        .split('\r\n')
        .filter((line) => !line.startsWith('a=candidate:'))
        .join('\r\n')
        .replace(/(a=mid:0\r\n)/, `$1a=candidate:1 1 UDP 2122317823 127.0.0.1 ${port} typ host\r\n`);

describe.skipIf(!nativeLibraryAvailable())('a connectivity check that draws a stray 401', async () => {
    const network = await loadNative();
    const opened: Array<PeerConnection | Socket> = [];
    afterEach(() => {
        for (const resource of opened.splice(0)) resource.close();
    });

    // Bedrock Dedicated Server answers a check on its shared port from more than one agent: a
    // success from the one the check was for, and an unauthenticated 401 from another. libwebrtc
    // treats a 401 as recoverable; libjuice used to fail the pair, which dropped the connection.
    it('keeps the pair the success response proved', async () => {
        const offering = new PeerConnection(network, { bindAddress: '127.0.0.1' });
        const answering = new PeerConnection(network, { bindAddress: '127.0.0.1' });
        opened.push(offering, answering);
        const states: PeerConnectionState[] = [];
        offering.on('connectionstatechange', (state: PeerConnectionState) => states.push(state));
        // The peer opens its channel or fails, whichever comes first.
        const settled = (channel: DataChannel) =>
            new Promise<'open' | 'failed'>((resolve) => {
                channel.on('open', () => resolve('open'));
                offering.on('connectionstatechange', (state: PeerConnectionState) => {
                    if (state === 'failed') resolve('failed');
                });
            });

        const gathered = new Promise<void>((resolve) =>
            offering.on('gatheringstatechange', (state: string) => {
                if (state === 'complete') resolve();
            })
        );
        const reliable = offering.createDataChannel('ReliableDataChannel');
        const outcome = settled(reliable);
        await gathered;
        const sdp = offering.currentLocalSdp() ?? '';
        const port = Number(/a=candidate:\S+ 1 UDP \d+ 127\.0\.0\.1 (\d+) typ host/i.exec(sdp)?.[1]);
        const relay = await strayErrorRelay({ address: '127.0.0.1', port });
        opened.push(relay.toOfferer, relay.toAnswerer);

        const received = new Promise<number>((resolve) => {
            let count = 0;
            answering.on('datachannel', (channel) =>
                channel.on('message', () => {
                    if (++count === 100) resolve(count);
                })
            );
        });
        answering.on('description', (description: { type: 'offer' | 'answer'; sdp: string }) =>
            offering.setRemoteDescription(description)
        );
        answering.setRemoteDescription({
            type: 'offer',
            sdp: candidateAt(sdp, relay.toOfferer.address().port)
        });
        expect(await outcome).toBe('open');
        for (let index = 0; index < 100; index++) reliable.send(Buffer.alloc(100, index));

        expect(await received).toBe(100);
        expect(relay.unauthorizedSent).toBeGreaterThan(0);
        expect(states).not.toContain('failed');
        expect(offering.connectionState).toBe('connected');
    });
});
