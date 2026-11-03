/**
 * Compares ordinary per-viewer compression with cached full-flush packet fragments.
 *
 * The three shapes model shared entity movement, clustered block changes, and four chunks
 * delivered to players in the same area. Every row checks decoded packet digests and reports
 * CPU per tick plus bytes written across all viewers.
 */
import { createHash } from 'node:crypto';

import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';

const VIEWERS = 20;
const TICKS_PER_SAMPLE = 30;
const WARMUPS = 2;
const SAMPLES = 7;
const codec = BatchCodec.compressed({ algorithm: PacketCompressionAlgorithm.ZLIB, level: 1, threshold: 256 });

const bytesOf = (length: number, seed: number): Buffer => {
    const bytes = Buffer.allocUnsafe(length);
    let state = seed | 0 || 1;
    for (let index = 0; index < length; index++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        bytes[index] = state & 0xff;
    }
    return bytes;
};

const scenarios = [
    { name: 'movement E=30 P=20', packets: Array.from({ length: 30 }, (_unused, index) => bytesOf(18, index + 1)) },
    {
        name: 'clustered blocks=256 P=20',
        packets: Array.from({ length: 256 }, (_unused, index) => bytesOf(22, index + 101))
    },
    { name: 'chunks=4 P=20', packets: Array.from({ length: 4 }, (_unused, index) => bytesOf(12 * 1024, index + 501)) }
] as const;

const digest = (batches: readonly Buffer[]): string => {
    const hash = createHash('sha256');
    for (const batch of batches) {
        for (const packet of codec.decode(batch)) hash.update(`${packet.byteLength}:`).update(packet);
        hash.update('|');
    }
    return hash.digest('hex');
};

const baselineTick = (packets: readonly Buffer[]): Buffer[] =>
    Array.from({ length: VIEWERS }, () => codec.encode(packets));

const fullFlushTick = (packets: readonly Buffer[]): Buffer[] => {
    const fragments = packets.map((packet) => codec.encodeFullFlushFragment(packet));
    return Array.from({ length: VIEWERS }, () => codec.encodeFullFlushFragments(packets, fragments));
};

const measure = (run: (packets: readonly Buffer[]) => Buffer[], packets: readonly Buffer[]) => {
    const elapsedUs: number[] = [];
    let lastBatches: Buffer[] = [];
    for (let sample = 0; sample < WARMUPS + SAMPLES; sample++) {
        const started = performance.now();
        for (let tick = 0; tick < TICKS_PER_SAMPLE; tick++) lastBatches = run(packets);
        const elapsed = ((performance.now() - started) * 1_000) / TICKS_PER_SAMPLE;
        if (sample >= WARMUPS) elapsedUs.push(elapsed);
    }
    elapsedUs.sort((left, right) => left - right);
    return {
        medianMicrosecondsPerTick: elapsedUs[Math.floor(elapsedUs.length / 2)]!,
        bytesPerTick: lastBatches.reduce((sum, batch) => sum + batch.byteLength, 0),
        digest: digest(lastBatches)
    };
};

const results = scenarios.map(({ name, packets }) => {
    const current = measure(baselineTick, packets);
    const fragmented = measure(fullFlushTick, packets);
    if (current.digest !== fragmented.digest) throw new Error(`${name} changed decoded packet bytes`);
    return {
        scenario: name,
        packetsPerViewer: packets.length,
        viewers: VIEWERS,
        decodedDigest: current.digest,
        current: {
            medianMicrosecondsPerTick: current.medianMicrosecondsPerTick,
            wireBytesPerTick: current.bytesPerTick
        },
        fullFlushFragments: {
            medianMicrosecondsPerTick: fragmented.medianMicrosecondsPerTick,
            wireBytesPerTick: fragmented.bytesPerTick
        }
    };
});

process.stdout.write(
    `${JSON.stringify({ benchmark: 'full-flush-fragments', node: process.version, results }, null, 2)}\n`
);
