import { deflateMaxSize, getWasmUrl, initSync } from '@mtcute/wasm';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { promisify } from 'node:util';
import { constants, createDeflateRaw, deflateRaw, deflateRawSync, inflateRawSync } from 'node:zlib';
import { test } from 'vitest';

const deflateRawAsync = promisify(deflateRaw);

/** Small movement-like packet bytes with repeated fields. */
const movement = Buffer.from([
    0x90, 0x01, 0x0a, 0x03, 0x2f, 0xa1, 0x08, 0x12, 0x6b, 0x8d, 0x2c, 0x10, 0x00, 0x40, 0x20, 0x07, 0x91, 0x01, 0x0a,
    0x03, 0x2f, 0xa1, 0x08, 0x12, 0x6b, 0x8d, 0x2c, 0x10, 0x00, 0x40, 0x20, 0x08
]);

/** A deterministic 64 KiB payload with repeated sections, like a chunk batch. */
const chunk = Buffer.allocUnsafe(64 * 1024);
for (let index = 0; index < chunk.byteLength; index++) {
    chunk[index] = ((index % 257) ^ ((index >>> 8) % 31) ^ (index >>> 12)) & 0xff;
}

/** Packet length prefix as used by a Bedrock batch. */
const packetLength = (length: number): Buffer => {
    const bytes: number[] = [];
    do {
        const low = length & 0x7f;
        length >>>= 7;
        bytes.push(length === 0 ? low : low | 0x80);
    } while (length !== 0);
    return Buffer.from(bytes);
};

/** The bytes every compressor must recover, including the packet length prefix. */
const batchBody = (packet: Buffer): Buffer => Buffer.concat([packetLength(packet.byteLength), packet]);

const wasmInitializationStarted = performance.now();
initSync(readFileSync(getWasmUrl()));
const wasmInitializationMs = performance.now() - wasmInitializationStarted;
console.info(`libdeflate WASM setup: ${wasmInitializationMs.toFixed(2)} ms`);

/** Reuses Node's public DeflateRaw stream API, finishing and resetting each independent batch. */
class ReusedDeflateRaw {
    public readonly setupMs: number;
    private readonly stream;

    public constructor() {
        const started = performance.now();
        this.stream = createDeflateRaw({ level: 7 });
        this.setupMs = performance.now() - started;
    }

    public compress(input: Buffer): Promise<{ compressed: Buffer; chunks: number }> {
        return new Promise((resolve, reject) => {
            const output: Buffer[] = [];
            const onData = (chunkBytes: Buffer): void => output.push(chunkBytes);
            const onError = (error: Error): void => {
                this.stream.off('data', onData);
                reject(error);
            };
            this.stream.on('data', onData);
            this.stream.once('error', onError);
            this.stream.write(input, (writeError) => {
                if (writeError) {
                    this.stream.off('data', onData);
                    this.stream.off('error', onError);
                    reject(writeError);
                    return;
                }

                this.stream.flush(constants.Z_FINISH, (flushError) => {
                    this.stream.off('data', onData);
                    this.stream.off('error', onError);
                    if (flushError) {
                        reject(flushError);
                        return;
                    }

                    const compressed = Buffer.concat(output);
                    // Z_FINISH gives each batch a complete raw-DEFLATE stream. Resetting only
                    // after the flush callback prevents the next batch from inheriting state.
                    this.stream.reset();
                    resolve({ compressed, chunks: output.length });
                });
            });
        });
    }

    public close(): void {
        this.stream.close();
    }
}

/** Uses libdeflate's zlib wrapper, then removes its 2-byte header and 4-byte checksum. */
const compressWithLibdeflate = (input: Buffer): Buffer => {
    const wrapped = deflateMaxSize(input, input.byteLength + 1024);
    if (wrapped === null || wrapped.byteLength < 6) throw new Error('libdeflate output buffer was too small');
    return Buffer.from(wrapped.buffer, wrapped.byteOffset + 2, wrapped.byteLength - 6);
};

for (const [name, packet] of [
    ['movement', movement],
    ['chunk', chunk]
] as const) {
    test(`raw DEFLATE alternatives: ${name}`, async ({ bench }) => {
        const input = batchBody(packet);
        const reused = new ReusedDeflateRaw();
        const variants = [
            {
                name: 'zlib-sync-level-7',
                compress: () => deflateRawSync(input, { level: 7 }),
                allocationNote: 'one native output Buffer per call'
            },
            {
                name: 'zlib-async-level-7',
                compress: () => deflateRawAsync(input, { level: 7 }),
                allocationNote: 'one native output Buffer per call; work runs in libuv'
            },
            {
                name: 'libdeflate-wasm-level-6',
                compress: () => compressWithLibdeflate(input),
                allocationNote: 'two WASM heap regions and one Uint8Array per call'
            },
            {
                name: 'zlib-reused-context-level-7',
                compress: async () => (await reused.compress(input)).compressed,
                allocationNote: 'stream output chunks plus one Buffer.concat output per call'
            }
        ];

        try {
            for (const variant of variants) {
                const compressed = await variant.compress();
                if (!inflateRawSync(compressed).equals(input)) {
                    throw new Error(`${variant.name} did not recover the original batch body`);
                }

                const iterations = input.byteLength < 1024 ? 500 : 50;
                const cpuStarted = process.cpuUsage();
                const elapsedStarted = performance.now();
                for (let index = 0; index < iterations; index++) await variant.compress();
                const elapsedMs = performance.now() - elapsedStarted;
                const cpu = process.cpuUsage(cpuStarted);
                console.info(
                    `${name}/${variant.name}: ${input.byteLength} raw bytes -> ${compressed.byteLength + 2} batch bytes ` +
                        `(${(((compressed.byteLength + 2) / input.byteLength) * 100).toFixed(1)}% of input); ` +
                        `${((elapsedMs * 1000) / iterations).toFixed(2)} us wall and ` +
                        `${((cpu.user + cpu.system) / iterations).toFixed(2)} us process CPU per encode; ` +
                        `${variant.allocationNote}`
                );
                if (variant.name === 'zlib-reused-context-level-7') {
                    const result = await reused.compress(input);
                    console.info(`  context setup ${reused.setupMs.toFixed(3)} ms; ${result.chunks} output chunks`);
                }
                await bench(variant.name, variant.compress).run();
            }
        } finally {
            reused.close();
        }
    });
}
