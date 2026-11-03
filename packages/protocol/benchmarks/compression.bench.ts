import { PacketCompressionAlgorithm } from '@jsprismarine/minecraft';
import { test } from 'vitest';
import { BatchCodec } from '../src/BatchCodec';

/** Deterministic bytes that resemble compact movement packets. */
const movement = Buffer.from([
    0x90, 0x01, 0x0a, 0x03, 0x2f, 0xa1, 0x08, 0x12, 0x6b, 0x8d, 0x2c, 0x10, 0x00, 0x40, 0x20, 0x07, 0x91, 0x01, 0x0a,
    0x03, 0x2f, 0xa1, 0x08, 0x12, 0x6b, 0x8d, 0x2c, 0x10, 0x00, 0x40, 0x20, 0x08
]);

/** A fixed, repeatable block-like payload with palette and section repetition. */
const chunk = Buffer.allocUnsafe(64 * 1024);
for (let index = 0; index < chunk.byteLength; index++) {
    chunk[index] = ((index % 257) ^ ((index >>> 8) % 31) ^ (index >>> 12)) & 0xff;
}

const algorithms = [
    ['zlib', PacketCompressionAlgorithm.ZLIB],
    ['snappy', PacketCompressionAlgorithm.SNAPPY],
    ['none', PacketCompressionAlgorithm.NONE]
] as const;

/** Counts the Buffer allocation factory calls on this synchronous encode path. */
const bufferFactoryCallsPerEncode = (encode: () => unknown): number => {
    const originalAllocUnsafe = Buffer.allocUnsafe;
    const originalConcat = Buffer.concat;
    let calls = 0;
    Buffer.allocUnsafe = (size) => {
        calls++;
        return originalAllocUnsafe(size);
    };
    Buffer.concat = (list, totalLength) => {
        calls++;
        return originalConcat(list, totalLength);
    };

    try {
        for (let index = 0; index < 20; index++) encode();
    } finally {
        Buffer.allocUnsafe = originalAllocUnsafe;
        Buffer.concat = originalConcat;
    }

    return calls / 20;
};

for (const [workload, payload] of [
    ['movement', movement],
    ['chunk', chunk]
] as const) {
    test(`packet batch compression: ${workload}`, async ({ bench }) => {
        for (const [name, algorithm] of algorithms) {
            const codec = BatchCodec.compressed({ algorithm, threshold: 1 });
            const outputLength = codec.encode([payload]).byteLength;
            const allocations = bufferFactoryCallsPerEncode(() => codec.encode([payload]));
            console.info(
                `${workload}/${name}: ${payload.byteLength} input bytes -> ${outputLength} batch bytes; ` +
                    `${allocations} Buffer factory calls/encode`
            );
            await bench(name, () => codec.encode([payload])).run();
        }
    });
}
