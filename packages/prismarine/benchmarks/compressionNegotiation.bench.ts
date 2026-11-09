/** Measures negotiated batch algorithms over a deterministic mixed packet workload. */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '@jsprismarine/protocol';

const BATCH_COUNT = 64;
const PACKET_COUNT = 24;
const SEED = 0x2826;
const WARMUP_BATCH_COUNT = 128;
const DEFAULT_ITERATIONS = 1_000;
const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const iterations = Number.parseInt(argumentsAfterScript[0] ?? `${DEFAULT_ITERATIONS}`, 10);
if (!Number.isSafeInteger(iterations) || iterations < 1) throw new RangeError('iterations must be a positive integer');

/** A tiny fixed-seed generator keeps packet bodies identical across algorithm runs. */
const seededBytes = (seed: number): (() => number) => {
    let state = seed >>> 0;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return state & 0xff;
    };
};

const nextByte = seededBytes(SEED);
const packetSizes = [24, 42, 80, 128, 384, 1_024, 64, 192] as const;
const workload = Array.from({ length: BATCH_COUNT }, (_, batchIndex) =>
    Array.from({ length: PACKET_COUNT }, (_, packetIndex) => {
        const packet = Buffer.alloc(packetSizes[(batchIndex + packetIndex) % packetSizes.length]!);
        packet[0] = 0x20 + (packetIndex % 32);
        for (let offset = 1; offset < packet.length; offset++) {
            // Repeated fields resemble names and metadata; seeded noise stands in for coordinates and ids.
            packet[offset] = packetIndex % 3 === 0 ? (offset + packetIndex) % 23 : nextByte();
        }
        return packet;
    })
);
const inputBytesPerBatch = workload[0]!.reduce((total, packet) => total + packet.byteLength, 0);
const expectedDigest = (count: number): string => {
    const digest = createHash('sha256');
    for (let iteration = 0; iteration < count; iteration++) {
        for (const packet of workload[iteration % workload.length]!) digest.update(packet);
    }
    return digest.digest('hex');
};
const expectedDigestHex = expectedDigest(iterations);

const percentile = (samples: readonly number[], ratio: number): number => {
    const sorted = [...samples].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))]!;
};

const algorithms = [
    ['zlib', PacketCompressionAlgorithm.ZLIB],
    ['snappy', PacketCompressionAlgorithm.SNAPPY],
    ['none', PacketCompressionAlgorithm.NONE]
] as const;

for (const [name, algorithm] of algorithms) {
    const codec = BatchCodec.compressed({ algorithm, threshold: 1 });
    // Warm codec and JIT paths before timing so first-use setup does not dominate the comparison.
    for (let iteration = 0; iteration < WARMUP_BATCH_COUNT; iteration++) {
        codec.decode(codec.encode(workload[iteration % workload.length]!));
    }
    const encodeLatencyMs: number[] = [];
    const roundTripLatencyMs: number[] = [];
    const digest = createHash('sha256');
    const cpuStart = process.cpuUsage();
    const wallStart = performance.now();
    let encodedBytes = 0;

    for (let iteration = 0; iteration < iterations; iteration++) {
        const packets = workload[iteration % workload.length]!;
        const encodeStart = performance.now();
        const frame = codec.encode(packets);
        encodeLatencyMs.push(performance.now() - encodeStart);
        const decoded = codec.decode(frame);
        roundTripLatencyMs.push(performance.now() - encodeStart);
        encodedBytes += frame.byteLength;
        for (const packet of decoded) digest.update(packet);
        if (decoded.length !== packets.length || decoded.some((packet, index) => !packet.equals(packets[index]!))) {
            throw new Error(`${name} round-trip changed packet bytes or order`);
        }
    }

    const wallMs = performance.now() - wallStart;
    const cpu = process.cpuUsage(cpuStart);
    const measuredDigest = digest.digest('hex');
    const batchesPerSecond = iterations / (wallMs / 1_000);
    const packetsPerSecond = (iterations * PACKET_COUNT) / (wallMs / 1_000);
    if (measuredDigest !== expectedDigestHex) {
        throw new Error(`${name} workload digest differs from the seeded source`);
    }

    process.stdout.write(
        `${JSON.stringify({
            algorithm: name,
            seed: SEED,
            warmupBatches: WARMUP_BATCH_COUNT,
            iterations,
            batches: iterations,
            packetsPerBatch: PACKET_COUNT,
            inputBytesPerBatch,
            encodedBytesPerBatchAverage: encodedBytes / iterations,
            totalEncodedBytes: encodedBytes,
            compressionRatio: encodedBytes / (iterations * inputBytesPerBatch),
            wallMs,
            cpuMs: (cpu.user + cpu.system) / 1_000,
            batchesPerSecond,
            packetsPerSecond,
            encodeP50Us: percentile(encodeLatencyMs, 0.5) * 1_000,
            encodeP95Us: percentile(encodeLatencyMs, 0.95) * 1_000,
            roundTripP50Us: percentile(roundTripLatencyMs, 0.5) * 1_000,
            roundTripP95Us: percentile(roundTripLatencyMs, 0.95) * 1_000,
            digest: measuredDigest
        })}\n`
    );
}
