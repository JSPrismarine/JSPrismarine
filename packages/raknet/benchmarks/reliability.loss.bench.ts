/**
 * Measures a 2 MiB reliable burst over a deterministic lossy link.
 *
 * Run `pnpm --filter @jsprismarine/raknet run bench:reliability:loss`. The peers are real
 * Sessions; only the datagram link adds delay and drops selected data datagrams.
 */
import { performance } from 'node:perf_hooks';

import type { Logger, RakNetPeer } from '../src/RakNetPeer';
import Session from '../src/Session';
import Frame from '../src/protocol/Frame';
import FrameReliability from '../src/protocol/FrameReliability';
import FrameSet from '../src/protocol/FrameSet';
import type Packet from '../src/protocol/Packet';

const PAYLOAD_BYTES = 2 * 1024 * 1024;
const ONE_WAY_DELAY_MS = 25;
const TICK_INTERVAL_MS = 10;
const MAX_DURATION_MS = 15_000;
const QUIET_AFTER_COMPLETION_MS = ONE_WAY_DELAY_MS * 2 + TICK_INTERVAL_MS * 2;
const REMOTE = { address: '127.0.0.1', port: 19132, family: 'IPv4' as const, size: 0 };
const logger: Logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {},
    debug: () => {},
    silly: () => {}
};

interface TransitDatagram {
    readonly from: 'sender' | 'receiver';
    readonly buffer: Buffer;
    readonly deliverAt: number;
}

const runLossScenario = async () => {
    const payload = Buffer.allocUnsafe(PAYLOAD_BYTES);
    for (let index = 0; index < payload.byteLength; index++) payload[index] = (index * 31 + 7) & 0xff;
    payload[0] = 0xfe;

    const transit: TransitDatagram[] = [];
    const firstSentReliableIndexes = new Set<number>();
    const receivedFragments = new Map<number, Buffer>();
    let sender: Session;
    let receiver: Session;
    let fragmentCount = 0;
    let droppedDatagrams = 0;
    let retransmittedBytes = 0;
    let peakQueueLength = 0;
    let lastActivityAt = performance.now();
    let completedAt: number | undefined;

    const createPeer = (side: TransitDatagram['from']): RakNetPeer => ({
        getLogger: () => logger,
        sendPacket: (packet: Packet) => {
            packet.encode();
            const buffer = Buffer.from(packet.getBuffer());
            const now = performance.now();
            lastActivityAt = now;

            if (side === 'sender' && packet instanceof FrameSet) {
                let retransmitted = false;
                for (const frame of packet.frames) {
                    if (!frame.isReliable() || typeof frame.reliableIndex !== 'number') continue;
                    if (firstSentReliableIndexes.has(frame.reliableIndex)) retransmitted = true;
                    else firstSentReliableIndexes.add(frame.reliableIndex);
                    if (frame.isFragmented()) fragmentCount = frame.fragmentSize;
                }
                if (retransmitted) retransmittedBytes += buffer.byteLength;

                // Drop a repeatable one-in-97 data datagram pattern after startup. Losses
                // occur mid-stream, so the receiver can report them with NACKs instead of
                // making the first sample depend on the retransmission timeout.
                if (packet.sequenceNumber % 97 === 5) {
                    droppedDatagrams++;
                    return;
                }
            }

            transit.push({ from: side, buffer, deliverAt: now + ONE_WAY_DELAY_MS });
        },
        emit: () => true,
        removeSession: () => {}
    });

    const senderPeer = createPeer('sender');
    const receiverPeer = createPeer('receiver');
    sender = new Session(senderPeer, 1400, REMOTE, 1n);
    receiver = new Session(receiverPeer, 1400, { ...REMOTE, port: 19133 }, 2n);

    const frame = new Frame();
    frame.reliability = FrameReliability.RELIABLE_ORDERED;
    frame.orderChannel = 0;
    frame.content = payload;

    const startedAt = performance.now();
    sender.sendFrame(frame);
    peakQueueLength = Math.max(peakQueueLength, fragmentCount - firstSentReliableIndexes.size);

    let nextUpdateAt = startedAt;
    while (performance.now() - startedAt < MAX_DURATION_MS) {
        const now = performance.now();

        for (let index = 0; index < transit.length;) {
            const datagram = transit[index]!;
            if (datagram.deliverAt > now) {
                index++;
                continue;
            }

            transit.splice(index, 1);
            lastActivityAt = now;
            if (datagram.from === 'sender') {
                const frameSet = new FrameSet(datagram.buffer);
                frameSet.decode();
                for (const received of frameSet.frames) {
                    if (!received.isFragmented()) continue;
                    receivedFragments.set(received.fragmentIndex, Buffer.from(received.content));
                }

                if (fragmentCount > 0 && receivedFragments.size === fragmentCount && completedAt === undefined) {
                    const assembled = Buffer.allocUnsafe(PAYLOAD_BYTES);
                    let offset = 0;
                    for (let fragmentIndex = 0; fragmentIndex < fragmentCount; fragmentIndex++) {
                        offset += receivedFragments.get(fragmentIndex)!.copy(assembled, offset);
                    }
                    if (!assembled.equals(payload)) throw new Error('The lossy link changed the reassembled payload');
                    completedAt = now;
                }
            }

            (datagram.from === 'sender' ? receiver : sender).handle(datagram.buffer);
        }

        if (now >= nextUpdateAt) {
            // Process delivered packets before ticking, so queued ACKs/NACKs are sent in
            // this pass and cannot lose a race to a retransmission timeout.
            sender.update(now);
            receiver.update(now);
            nextUpdateAt = now + TICK_INTERVAL_MS;
        }

        if (completedAt !== undefined && transit.length === 0 && now - lastActivityAt >= QUIET_AFTER_COMPLETION_MS) {
            break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1));
    }

    if (completedAt === undefined) throw new Error(`The 2 MiB burst did not complete within ${MAX_DURATION_MS} ms`);
    if (droppedDatagrams === 0 || retransmittedBytes === 0) {
        throw new Error('The deterministic loss scenario did not exercise retransmission');
    }

    return {
        benchmark: 'raknet-reliability',
        scenario: 'loss',
        payloadBytes: PAYLOAD_BYTES,
        simulatedRttMs: ONE_WAY_DELAY_MS * 2,
        lossPattern: 'one data datagram in 97',
        droppedDatagrams,
        completionMs: completedAt - startedAt,
        retransmittedBytes,
        peakQueueLength,
        fragments: fragmentCount
    };
};

console.log(JSON.stringify(await runLossScenario()));
