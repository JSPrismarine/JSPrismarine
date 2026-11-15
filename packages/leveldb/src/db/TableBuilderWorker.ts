import fs from 'node:fs';
import path from 'node:path';
import { parentPort } from 'node:worker_threads';

import { TableFile, writeFileSynced } from './Storage';
import { compareBytewise } from '../util/Comparator';
import {
    compareInternalKeys,
    extractUserKey,
    findShortInternalSuccessor,
    findShortestInternalSeparator
} from '../format/InternalKey';
import { compactEntries } from './Compaction';
import { mergeSorted } from '../util/mergeSorted';
import { TableBuilder } from '../format/TableBuilder';
import { TableReader } from '../format/TableReader';
import { tableFileName } from '../util/FileNames';
import type { TableBuilderOptions } from '../format/TableBuilder';
import type {
    BuildTableTask,
    CompactTablesTask,
    TableWorkerReply,
    TableWorkerResult,
    TableWorkerTask,
    WorkerTableMetadata
} from './TableWorkerProtocol';

const port = parentPort;
if (port === null) throw new Error('TableBuilderWorker must run in a worker thread');

const tableOptions = (options: BuildTableTask['options']): TableBuilderOptions => ({
    ...options,
    shortestSeparator: findShortestInternalSeparator,
    shortSuccessor: findShortInternalSuccessor,
    filterKey: extractUserKey
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

        const merged = mergeSorted(sources, (left, right) => compareInternalKeys(left.key, right.key));
        for (const table of compactEntries(merged, {
            maxFileSize: task.maxFileSize,
            table: tableOptions(task.options),
            hasOlderFile
        })) {
            const fileNumber = nextFileNumber++;
            const outputPath = path.join(task.directory, tableFileName(fileNumber));
            try {
                writeFileSynced(outputPath, table.bytes);
            } catch (error) {
                fs.rmSync(outputPath, { force: true });
                throw error;
            }

            outputs.push([
                task.outputLevel,
                { number: fileNumber, size: table.bytes.byteLength, smallest: table.smallest, largest: table.largest }
            ]);
        }

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
