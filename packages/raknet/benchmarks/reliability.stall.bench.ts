/**
 * Counts reliable datagrams retransmitted when an ACK is queued during a simulated event-loop stall.
 *
 * Run `JSP_RAKNET_STALL_MS=2500 JSP_RAKNET_IN_FLIGHT_FRAMES=64 pnpm --filter @jsprismarine/raknet run bench:reliability`.
 */
import { performance } from 'node:perf_hooks';
import { test } from 'vitest';

import type { Logger, RakNetPeer } from '../src/RakNetPeer';
import Session from '../src/Session';
import ACK from '../src/protocol/ACK';
import Frame from '../src/protocol/Frame';
import FrameReliability from '../src/protocol/FrameReliability';
import FrameSet from '../src/protocol/FrameSet';
import type Packet from '../src/protocol/Packet';
import { RTO_MAX_MS } from '../src/Constants';

const STALL_MS = Number.parseInt(process.env.JSP_RAKNET_STALL_MS ?? '2500', 10);
const IN_FLIGHT_FRAMES = Number.parseInt(process.env.JSP_RAKNET_IN_FLIGHT_FRAMES ?? '64', 10);
const REMOTE = { address: '127.0.0.1', port: 19132, family: 'IPv4' as const, size: 0 };
const logger: Logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {},
    debug: () => {},
    silly: () => {}
};

if (!Number.isSafeInteger(STALL_MS) || STALL_MS <= RTO_MAX_MS) {
    throw new RangeError(`JSP_RAKNET_STALL_MS must be an integer greater than ${RTO_MAX_MS}`);
}
if (!Number.isSafeInteger(IN_FLIGHT_FRAMES) || IN_FLIGHT_FRAMES < 1) {
    throw new RangeError('JSP_RAKNET_IN_FLIGHT_FRAMES must be a positive integer');
}

type UpdateOrder = 'timer-before-poll' | 'poll-before-session-update';

interface StallResult {
    readonly inFlightDatagrams: number;
    readonly retransmittedDatagrams: number;
}

const runStall = (order: UpdateOrder): StallResult => {
    const datagrams: Buffer[] = [];
    const peer: RakNetPeer = {
        getLogger: () => logger,
        sendPacket: (packet: Packet) => {
            packet.encode();
            datagrams.push(Buffer.from(packet.getBuffer()));
        },
        emit: () => true,
        removeSession: () => {}
    };
    const session = new Session(peer, 1400, REMOTE, 1n);

    for (let index = 0; index < IN_FLIGHT_FRAMES; index++) {
        const frame = new Frame();
        frame.reliability = FrameReliability.RELIABLE_ORDERED;
        frame.orderChannel = 0;
        frame.content = Buffer.alloc(64, index & 0xff);
        session.sendFrame(frame);
    }
    session.sendFrameQueue();

    const inFlightDatagrams = datagrams.length;
    const acknowledgedSequences = datagrams.map((datagram) => {
        const frameSet = new FrameSet(datagram);
        frameSet.decode();
        return frameSet.sequenceNumber;
    });
    const ack = new ACK();
    ack.sequenceNumbers = acknowledgedSequences;
    ack.encode();
    const ackBuffer = Buffer.from(ack.getBuffer());
    const retransmissionStart = datagrams.length;
    const stalledAt = performance.now() + STALL_MS;

    if (order === 'timer-before-poll') {
        session.update(stalledAt);
        session.handle(ackBuffer);
    } else {
        session.handle(ackBuffer);
        session.update(stalledAt);
    }

    return {
        inFlightDatagrams,
        retransmittedDatagrams: datagrams.length - retransmissionStart
    };
};

const timerFirst = runStall('timer-before-poll');
const pollFirst = runStall('poll-before-session-update');
console.log(
    JSON.stringify({
        benchmark: 'raknet-reliability',
        scenario: 'stall',
        stallMs: STALL_MS,
        inFlightFrames: IN_FLIGHT_FRAMES,
        inFlightDatagrams: timerFirst.inFlightDatagrams,
        datagramsRetransmittedBeforePendingAck: timerFirst.retransmittedDatagrams,
        datagramsRetransmittedAfterPendingAck: pollFirst.retransmittedDatagrams
    })
);
if (timerFirst.retransmittedDatagrams < 1 || pollFirst.retransmittedDatagrams !== 0) {
    throw new Error('The stall scenario did not distinguish timer-first from poll-first updates');
}

test('RakNet reliability stall scenario', async ({ bench }) => {
    await bench.compare(
        bench('update before draining pending ACKs', () => runStall('timer-before-poll')),
        bench('drain pending ACKs before update', () => runStall('poll-before-session-update'))
    );
});
