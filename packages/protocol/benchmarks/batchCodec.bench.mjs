/**
 * Compares batch wire size and encode time across payload sizes, zlib levels, and thresholds.
 *
 * Run `pnpm --filter @jsprismarine/protocol run bench:batch-codec`.
 */
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { BatchCodec } from '../src/BatchCodec.ts';

const PAYLOAD_SIZES = [24, 64, 128, 256, 512, 4 * 1024, 64 * 1024];
const LEVELS = [1, 6, 7];
const THRESHOLDS = [1, 128, 256, 512];
const ITERATIONS = 100;
const SAMPLES = 5;

/** Builds deterministic high-entropy bytes, so repeated payloads do not flatter compression. */
const payloadOf = (size) => {
    const payload = Buffer.allocUnsafe(size);
    let state = 0x6d2b79f5;

    for (let index = 0; index < size; index++) {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        payload[index] = state & 0xff;
    }

    return payload;
};

const median = (values) => {
    const ordered = [...values].sort((left, right) => left - right);
    return ordered[Math.floor(ordered.length / 2)];
};

console.log('payload bytes\tzlib level\tthreshold\tµs per batch\twire bytes');

for (const size of PAYLOAD_SIZES) {
    const payload = payloadOf(size);

    for (const level of LEVELS) {
        for (const threshold of THRESHOLDS) {
            const codec = BatchCodec.compressed({
                algorithm: PacketCompressionAlgorithm.ZLIB,
                level,
                threshold
            });
            const first = codec.encode([payload]);
            assert.deepEqual(codec.decode(first), [payload], `${size} bytes, level ${level}, threshold ${threshold}`);

            const wireBytes = first.byteLength;
            const samples = [];
            for (let sample = 0; sample < SAMPLES; sample++) {
                const started = performance.now();
                for (let iteration = 0; iteration < ITERATIONS; iteration++) codec.encode([payload]);
                samples.push(((performance.now() - started) * 1000) / ITERATIONS);
            }

            console.log(`${size}\t${level}\t${threshold}\t${median(samples).toFixed(2)}\t${wireBytes}`);
        }
    }
}
