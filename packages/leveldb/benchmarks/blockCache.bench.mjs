import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { Database } from '../dist/index.es.js';

const targetBytes = Number.parseInt(process.argv[2] ?? `${40 * 1024 * 1024}`, 10);
if (!Number.isSafeInteger(targetBytes) || targetBytes < 1) throw new RangeError('Bytes must be a positive integer');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-leveldb-block-cache-'));
const valueBytes = 3 * 1024;
const entryCount = Math.ceil(targetBytes / valueBytes);
const keys = [];
let peakArrayBuffers = process.memoryUsage().arrayBuffers;

try {
    const buildStarted = performance.now();
    const database = await Database.open(directory, {
        blockCacheSize: 16 * 1024 * 1024,
        maxFileSize: 2 * 1024 * 1024,
        writeBufferSize: 8 * 1024 * 1024
    });

    for (let index = 0; index < entryCount; index++) {
        const key = Buffer.alloc(8);
        key.writeUInt32LE(index, 0);
        key.writeUInt32LE(0x43484b31, 4);
        keys.push(key);
        const value = Buffer.alloc(valueBytes, index & 0xff);
        value.writeUInt32LE(index, 0);
        database.put(key, value);
        if (index > 0 && index % 1000 === 0) await database.flush();
        if (index % 256 === 0) {
            peakArrayBuffers = Math.max(peakArrayBuffers, process.memoryUsage().arrayBuffers);
        }
    }
    await database.flush();
    const writeAndCompactionMs = performance.now() - buildStarted;
    peakArrayBuffers = Math.max(peakArrayBuffers, process.memoryUsage().arrayBuffers);

    const started = performance.now();
    for (let pass = 0; pass < 2; pass++) {
        for (let index = 0; index < keys.length; index++) {
            const value = database.get(keys[index]);
            if (value === null || value.readUInt32LE(0) !== index) throw new Error(`Lookup mismatch at ${index}`);
            if (index % 256 === 0) {
                peakArrayBuffers = Math.max(peakArrayBuffers, process.memoryUsage().arrayBuffers);
            }
        }
    }
    const lookupMs = performance.now() - started;
    peakArrayBuffers = Math.max(peakArrayBuffers, process.memoryUsage().arrayBuffers);

    console.log(
        JSON.stringify({
            benchmark: 'leveldb-block-cache-compaction',
            targetBytes,
            entries: entryCount,
            passes: 2,
            writeAndCompactionMs,
            lookupMs,
            arrayBuffersPeakBytes: peakArrayBuffers,
            cache: database.stats.blockCache
        })
    );

    await database.close();
} finally {
    fs.rmSync(directory, { recursive: true, force: true });
}
