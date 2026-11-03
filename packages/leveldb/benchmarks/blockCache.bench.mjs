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
const keysByChunk = [];
const missingKeys = [];
let peakArrayBuffers = process.memoryUsage().arrayBuffers;

try {
    const buildStarted = performance.now();
    const database = await Database.open(directory, {
        blockCacheSize: 16 * 1024 * 1024,
        maxFileSize: 2 * 1024 * 1024,
        writeBufferSize: 8 * 1024 * 1024
    });

    for (let index = 0; index < entryCount; index++) {
        const chunkIndex = Math.floor(index / 30);
        const key = Buffer.from(`chunk:${String(chunkIndex).padStart(8, '0')}:${String(index % 30).padStart(2, '0')}`);
        keys.push(key);
        missingKeys.push(Buffer.concat([key, Buffer.from([0])]));
        (keysByChunk[chunkIndex] ??= []).push(key);
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

    const hitStarted = performance.now();
    for (let pass = 0; pass < 2; pass++) {
        for (let index = 0; index < keys.length; index++) {
            const value = database.get(keys[index]);
            if (value === null || value.readUInt32LE(0) !== index) throw new Error(`Lookup mismatch at ${index}`);
        }
    }
    const hitLookupMs = performance.now() - hitStarted;

    const missStarted = performance.now();
    for (let pass = 0; pass < 2; pass++) {
        for (const key of missingKeys) {
            if (database.get(key) !== null) throw new Error(`Miss matched an existing key: ${key.toString('hex')}`);
        }
    }
    const missLookupMs = performance.now() - missStarted;

    const chunkReadStarted = performance.now();
    for (let pass = 0; pass < 2; pass++) {
        for (const chunkKeys of keysByChunk) {
            for (const key of chunkKeys) {
                if (database.get(key) === null) throw new Error(`Chunk record is missing: ${key.toString('hex')}`);
            }
        }
    }
    const chunkReadMs = performance.now() - chunkReadStarted;
    peakArrayBuffers = Math.max(peakArrayBuffers, process.memoryUsage().arrayBuffers);

    console.log(
        JSON.stringify({
            benchmark: 'leveldb-block-cache-compaction',
            targetBytes,
            entries: entryCount,
            passes: 2,
            writeAndCompactionMs,
            pointLookups: {
                hitMs: Number(hitLookupMs.toFixed(2)),
                hitUsPerLookup: Number(((hitLookupMs * 1000) / (entryCount * 2)).toFixed(3)),
                missMs: Number(missLookupMs.toFixed(2)),
                missUsPerLookup: Number(((missLookupMs * 1000) / (entryCount * 2)).toFixed(3))
            },
            chunkReads: {
                chunks: keysByChunk.length,
                chunkReadMs: Number(chunkReadMs.toFixed(2)),
                msPerChunk: Number((chunkReadMs / (keysByChunk.length * 2)).toFixed(4))
            },
            arrayBuffersPeakBytes: peakArrayBuffers,
            cache: database.stats.blockCache
        })
    );

    await database.close();
} finally {
    fs.rmSync(directory, { recursive: true, force: true });
}
