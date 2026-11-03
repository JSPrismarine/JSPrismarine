/** Measures steady-state session updates and small ACK batches at several history sizes. */
import { performance } from 'node:perf_hooks';

import type { Logger, RakNetPeer } from '../src/RakNetPeer';
import Session, { RakNetPriority } from '../src/Session';
import ACK from '../src/protocol/ACK';
import Frame from '../src/protocol/Frame';
import FrameReliability from '../src/protocol/FrameReliability';
import FrameSet from '../src/protocol/FrameSet';
import type Packet from '../src/protocol/Packet';

const MTU = 1400;
const ACK_BATCH_SIZE = 4;
const UPDATE_ITERATIONS = 20_000;
const ACK_SAMPLES = 21;
const IN_FLIGHT_COUNTS = [16, 128, 512];
const REMOTE = { address: '127.0.0.1', port: 19132, family: 'IPv4' as const, size: 0 };
const logger: Logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    verbose: () => {},
    debug: () => {},
    silly: () => {}
};

const decodeSequence = (datagram: Buffer): number => {
    const frameSet = new FrameSet(datagram);
    frameSet.decode();
    return frameSet.sequenceNumber;
};

const encodeAcknowledgment = (sequenceNumbers: number[]): Buffer => {
    const packet = new ACK();
    packet.sequenceNumbers = sequenceNumbers;
    packet.encode();
    return Buffer.from(packet.getBuffer());
};

const makeSession = (targetInFlight: number) => {
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
    const session = new Session(peer, MTU, REMOTE, 1n);
    const acknowledged = new Set<number>();

    const inFlightCount = (): number => datagrams.length - acknowledged.size;

    while (inFlightCount() < targetInFlight) {
        const frame = new Frame();
        frame.reliability = FrameReliability.RELIABLE_ORDERED;
        frame.orderChannel = 0;
        frame.content = Buffer.alloc(1300, datagrams.length & 0xff);
        const before = datagrams.length;
        session.sendFrame(frame, RakNetPriority.IMMEDIATE);

        if (datagrams.length === before) {
            const sequenceNumber = datagrams.map(decodeSequence).find((sequence) => !acknowledged.has(sequence));
            if (sequenceNumber === undefined) throw new Error('No in-flight datagram available to grow the window');

            acknowledged.add(sequenceNumber);
            session.handle(encodeAcknowledgment([sequenceNumber]));
        }
    }

    const sequenceNumbers = datagrams.map(decodeSequence).filter((sequenceNumber) => !acknowledged.has(sequenceNumber));
    return { session, sequenceNumbers };
};

const median = (samples: number[]): number => {
    const ordered = [...samples].sort((a, b) => a - b);
    return ordered[Math.floor(ordered.length / 2)]!;
};

const measureUpdate = (targetInFlight: number): number => {
    const { session } = makeSession(targetInFlight);
    const timestamp = performance.now();
    for (let index = 0; index < 1000; index++) session.update(timestamp);

    const started = process.hrtime.bigint();
    for (let index = 0; index < UPDATE_ITERATIONS; index++) session.update(timestamp);
    const elapsedNanoseconds = Number(process.hrtime.bigint() - started);
    return elapsedNanoseconds / UPDATE_ITERATIONS / 1000;
};

const measureAckHandling = (targetInFlight: number): number => {
    const samples: number[] = [];

    for (let sample = 0; sample < ACK_SAMPLES; sample++) {
        const { session, sequenceNumbers } = makeSession(targetInFlight);
        const ack = encodeAcknowledgment(sequenceNumbers.slice(0, ACK_BATCH_SIZE));
        const started = process.hrtime.bigint();
        session.handle(ack);
        samples.push(Number(process.hrtime.bigint() - started) / 1000);
    }

    return median(samples);
};

const results = IN_FLIGHT_COUNTS.map((inFlightDatagrams) => ({
    inFlightDatagrams,
    updateMicroseconds: measureUpdate(inFlightDatagrams),
    ackHandlingMicroseconds: measureAckHandling(inFlightDatagrams)
}));

console.log(JSON.stringify({ benchmark: 'raknet-reliability', scenario: 'steady', results }));
