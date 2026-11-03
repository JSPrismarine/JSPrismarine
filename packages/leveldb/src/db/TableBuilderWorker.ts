import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';

import { TableFile, writeFileSynced } from './Storage';
import { compareBytewise } from '../util/Comparator';
import {
    ValueType,
    compareInternalKeys,
    extractUserKey,
    findShortInternalSuccessor,
    findShortestInternalSeparator,
    parseInternalKey
} from '../format/InternalKey';
import { TableBuilder } from '../format/TableBuilder';
import { TableReader } from '../format/TableReader';
import { tableFileName } from '../util/FileNames';
import type {
    BuildTableTask,
    CompactTablesTask,
    TableWorkerReply,
    TableWorkerResult,
    TableWorkerTask,
    WorkerTableMetadata
} from './TableWorkerProtocol';
import type { BlockEntry } from '../format/BlockReader';

const port = parentPort;
if (port === null) throw new Error('TableBuilderWorker must run in a worker thread');

const tableOptions = (options: BuildTableTask['options']): ConstructorParameters<typeof TableBuilder>[0] => ({
    ...options,
    shortestSeparator: findShortestInternalSeparator,
    shortSuccessor: findShortInternalSuccessor
});

const buildTable = (task: BuildTableTask): TableWorkerResult => {
    const builder = new TableBuilder(tableOptions(task.options));
    for (const entry of task.entries) {
        builder.add(Buffer.from(entry.internalKey), Buffer.from(entry.value));
    }

    const bytes = builder.finish();
    writeFileSynced(task.filePath, bytes);
    return {
        kind: 'built',
        file: {
            number: task.fileNumber,
            size: bytes.byteLength,
            smallest: Buffer.from(task.smallest),
            largest: Buffer.from(task.largest)
        }
    };
};

const compactionMerge = (sources: Array<Iterator<BlockEntry>>): IterableIterator<BlockEntry> =>
    mergeSorted(sources, (left, right) => compareInternalKeys(left.key, right.key));

const compactTables = (task: CompactTablesTask): TableWorkerResult => {
    const opened: TableFile[] = [];
    const outputs: Array<[number, WorkerTableMetadata]> = [];
    let nextFileNumber = task.firstOutputNumber;

    try {
        const sources = task.inputs.map((metadata) => {
            const file = new TableFile(path.join(task.directory, tableFileName(metadata.number)));
            opened.push(file);
            return new TableReader(file, compareInternalKeys, { fileNumber: metadata.number })
                .entries({ useCache: false })
                [Symbol.iterator]();
        });
        const deeperRanges = task.deeperRanges.map(({ smallest, largest }) => ({
            smallest: extractUserKey(Buffer.from(smallest)),
            largest: extractUserKey(Buffer.from(largest))
        }));
        const hasOlderFile = (userKey: Buffer): boolean =>
            deeperRanges.some(
                ({ smallest, largest }) =>
                    compareBytewise(userKey, smallest) >= 0 && compareBytewise(userKey, largest) <= 0
            );

        let builder: TableBuilder | null = null;
        let currentEntries: BlockEntry[] = [];
        let previousUserKey: Buffer | null = null;

        const buildBytes = (entries: BlockEntry[]): Buffer => {
            const tableBuilder = new TableBuilder(tableOptions(task.options));
            for (const entry of entries) tableBuilder.add(entry.key, entry.value);
            return tableBuilder.finish();
        };

        const writeBounded = (entries: BlockEntry[], bytes: Buffer): void => {
            if (bytes.byteLength <= task.maxFileSize || entries.length === 1) {
                const fileNumber = nextFileNumber++;
                const outputPath = path.join(task.directory, tableFileName(fileNumber));
                try {
                    writeFileSynced(outputPath, bytes);
                } catch (error) {
                    fs.rmSync(outputPath, { force: true });
                    throw error;
                }
                outputs.push([
                    task.outputLevel,
                    {
                        number: fileNumber,
                        size: bytes.byteLength,
                        smallest: Buffer.from(entries[0]!.key),
                        largest: Buffer.from(entries.at(-1)!.key)
                    }
                ]);
                return;
            }

            // Footer and index bytes are not included in TableBuilder.size. Split an oversized
            // candidate at the largest prefix whose complete encoded table fits the configured cap.
            let low = 1;
            let high = entries.length - 1;
            let fittingCount = 0;
            let fittingBytes: Buffer | null = null;
            while (low <= high) {
                const middle = (low + high) >>> 1;
                const prefixBytes = buildBytes(entries.slice(0, middle));
                if (prefixBytes.byteLength <= task.maxFileSize) {
                    fittingCount = middle;
                    fittingBytes = prefixBytes;
                    low = middle + 1;
                } else {
                    high = middle - 1;
                }
            }

            if (fittingCount === 0) {
                writeBounded(entries.slice(0, 1), buildBytes(entries.slice(0, 1)));
                const remainder = entries.slice(1);
                if (remainder.length > 0) writeBounded(remainder, buildBytes(remainder));
                return;
            }

            const prefix = entries.slice(0, fittingCount);
            if (fittingBytes === null) throw new Error('Table split lost its fitting prefix');
            writeBounded(prefix, fittingBytes);
            const remainder = entries.slice(fittingCount);
            if (remainder.length > 0) writeBounded(remainder, buildBytes(remainder));
        };

        const finishFile = (): void => {
            if (builder === null || currentEntries.length === 0) return;

            const bytes = builder.finish();
            writeBounded(currentEntries, bytes);
            builder = null;
            currentEntries = [];
        };

        for (const entry of compactionMerge(sources)) {
            const userKey = extractUserKey(entry.key);

            if (previousUserKey !== null && compareBytewise(previousUserKey, userKey) === 0) continue;
            previousUserKey = Buffer.from(userKey);
            if (parseInternalKey(entry.key).type === ValueType.Deletion && !hasOlderFile(userKey)) continue;

            if (builder === null) {
                builder = new TableBuilder(tableOptions(task.options));
            }

            builder.add(entry.key, entry.value);
            currentEntries.push(entry);
            if (builder.size >= task.maxFileSize) finishFile();
        }

        finishFile();
        return { kind: 'compacted', outputs, nextFileNumber };
    } catch (error) {
        for (const [, output] of outputs) {
            fs.rmSync(path.join(task.directory, tableFileName(output.number)), { force: true });
        }
        throw error;
    } finally {
        for (const file of opened) file.close();
    }
};

const execute = (task: TableWorkerTask): TableWorkerResult =>
    task.kind === 'build' ? buildTable(task) : compactTables(task);

// One worker handles sequential table jobs for the database's entire open session.
port.on('message', (task: TableWorkerTask) => {
    try {
        const reply: TableWorkerReply = { result: execute(task) };
        port.postMessage(reply);
    } catch (error) {
        const reply: TableWorkerReply = { error: error instanceof Error ? error.message : String(error) };
        port.postMessage(reply);
    }
});

/** Merges pre-sorted table iterators using their first unconsumed entry. */
function* mergeSorted<T>(sources: Array<Iterator<T>>, compare: (a: T, b: T) => number): IterableIterator<T> {
    const heads = sources.map((source) => source.next());

    for (;;) {
        let best = -1;
        let bestHead: IteratorYieldResult<T> | null = null;
        for (let i = 0; i < heads.length; i++) {
            const head = heads[i]!;
            if (head.done) continue;
            if (bestHead === null || compare(head.value, bestHead.value) < 0) {
                best = i;
                bestHead = head;
            }
        }

        if (bestHead === null) return;

        yield bestHead.value;
        heads[best] = sources[best]!.next();
    }
}
