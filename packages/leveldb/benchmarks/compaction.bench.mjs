import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { Database, WriteBatch } from '../dist/index.es.js';

const requestedSizes = process.argv
    .slice(2)
    .filter((value) => value !== '--')
    .map((value) => Number.parseInt(value, 10));
const sizesMiB = requestedSizes.length === 0 ? [10, 40, 160] : requestedSizes;
if (sizesMiB.some((size) => !Number.isSafeInteger(size) || size < 1)) {
    throw new RangeError('Requested sizes must be positive integer MiB values');
}

const percentile = (values, fraction) => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
};

for (const sizeMiB of sizesMiB) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), `jsp-leveldb-compaction-${sizeMiB}-`));
    const latenciesMs = [];
    let peakRssBytes = process.memoryUsage().rss;

    try {
        const database = await Database.open(directory, { l0CompactionTrigger: 2 });
        const bytesBefore = database.stats.bytesWritten;
        const targetBytes = sizeMiB * 1024 * 1024;
        const bytesPerChunkBatch = 8 * 3 * 1024;
        const batches = Math.ceil(targetBytes / bytesPerChunkBatch);

        for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
            const batch = new WriteBatch();
            for (let subChunk = 0; subChunk < 8; subChunk++) {
                const key = Buffer.from(`chunk:${String(batchIndex).padStart(8, '0')}:sub:${subChunk}`);
                const value = Buffer.alloc(3 * 1024, (batchIndex * 8 + subChunk) % 251);
                value.writeUInt32LE(batchIndex, 0);
                value.writeUInt8(subChunk, 4);
                batch.put(key, value);
            }

            const started = performance.now();
            database.write(batch);
            latenciesMs.push(performance.now() - started);
            peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
            await new Promise((resolve) => setImmediate(resolve));
        }

        const flushStarted = performance.now();
        await database.flush();
        const flushMs = performance.now() - flushStarted;
        peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss);
        const rssAfterFlushBytes = process.memoryUsage().rss;
        const stats = database.stats;
        await database.close();

        console.log(
            JSON.stringify({
                benchmark: 'leveldb-compaction',
                node: process.version,
                platform: `${os.platform()}-${os.arch()}`,
                cpu: os.cpus()[0]?.model ?? 'unknown',
                targetMiB: sizeMiB,
                chunkBatches: batches,
                writes: latenciesMs.length,
                p50WriteMs: percentile(latenciesMs, 0.5),
                p99WriteMs: percentile(latenciesMs, 0.99),
                maxWriteMs: Math.max(...latenciesMs),
                flushMs,
                bytesWritten: stats.bytesWritten - bytesBefore,
                rssBytesPeak: peakRssBytes,
                rssBytesAfterFlush: rssAfterFlushBytes,
                levels: database.levelSizes
            })
        );
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
}
