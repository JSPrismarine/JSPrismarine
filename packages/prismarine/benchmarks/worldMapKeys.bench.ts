/**
 * Compares string coordinate keys with the production numeric coordinate indexes.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:world-keys [entries] [samples]`. The
 * scheduler rows exercise a production class; redstone measures the same nested
 * key layout used by `contentRedstoneUpdateHandlers`.
 */
import os from 'node:os';

import { BlockUpdateScheduler } from '../src/world/BlockUpdateScheduler';
import { blockPositionKeys, coordinatePairKey } from '../src/world/positionKeys';

const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const ENTRY_COUNT = Number.parseInt(argumentsAfterScript[0] ?? '20000', 10);
const SAMPLES = Number.parseInt(argumentsAfterScript[1] ?? '5', 10);
const WARMUPS = 2;

for (const [name, value] of [
    ['entries', ENTRY_COUNT],
    ['samples', SAMPLES]
] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
}

interface Update {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

interface PendingUpdate {
    readonly at: number;
    readonly update: Update;
}

interface ScheduleSample {
    readonly scheduleMs: number;
    readonly dueMs: number;
    readonly dueCount: number;
    readonly digest: number;
}

const positions: Update[] = Array.from({ length: ENTRY_COUNT }, (_unused, index) => ({
    x: (index % 256) * 16 - 2048,
    y: 64 + (index % 256),
    z: Math.trunc(index / 256) * 16 - Math.ceil(ENTRY_COUNT / 256) * 8
}));

const measureScheduler = (indexed: boolean, mixed: boolean): ScheduleSample => {
    const scheduler = indexed ? new BlockUpdateScheduler() : undefined;
    const linear = indexed ? undefined : new Map<string, PendingUpdate>();
    const updates = positions.map((update, index) => ({
        update,
        delay: mixed && index % 2 === 1 ? 1 : 100
    }));
    const startedSchedule = performance.now();
    for (const { update, delay } of updates) {
        if (scheduler !== undefined) scheduler.schedule(update.x, update.y, update.z, 0, delay);
        else {
            const key = `${update.x},${update.y},${update.z}`;
            const at = Math.max(1, delay);
            const existing = linear!.get(key);
            if (existing === undefined || at < existing.at) linear!.set(key, { at, update });
        }
    }
    for (const { update } of updates) {
        if (scheduler !== undefined) scheduler.schedule(update.x, update.y, update.z, 0, 200);
        else {
            const key = `${update.x},${update.y},${update.z}`;
            const existing = linear!.get(key);
            if (existing === undefined || existing.at > 200) linear!.set(key, { at: 200, update });
        }
    }
    const scheduleMs = performance.now() - startedSchedule;

    const dueTick = mixed ? 1 : 0;
    const startedDue = performance.now();
    const due: Update[] = [];
    if (scheduler !== undefined) due.push(...scheduler.due(dueTick));
    else {
        for (const [key, entry] of linear!) {
            if (entry.at > dueTick) continue;
            due.push(entry.update);
            linear!.delete(key);
            if (due.length >= 4096) break;
        }
    }
    const dueMs = performance.now() - startedDue;
    let digest = 0;
    for (const { x, y, z } of due) digest = Math.imul(digest ^ Math.imul(x, 31) ^ Math.imul(y, 17) ^ z, 16_777_619) | 0;
    return { scheduleMs, dueMs, dueCount: due.length, digest };
};

interface RedstoneSample {
    readonly ms: number;
    readonly invalidations: number;
    readonly digest: number;
}

const redstonePositions = positions.map((position) => ({
    x: position.x,
    y: position.y,
    z: position.z
}));

const measureRedstoneCache = (indexed: boolean): RedstoneSample => {
    const cache = new Map<number | string, Map<number | string, number>>();
    let digest = 0;
    let invalidations = 0;
    const started = performance.now();
    for (const [index, at] of redstonePositions.entries()) {
        let chunk: number | string;
        let position: number | string;
        if (indexed) {
            ({ chunk, position } = blockPositionKeys(at.x, at.y, at.z));
        } else {
            chunk = `${at.x >> 4},${at.z >> 4}`;
            position = `${at.x},${at.y},${at.z}`;
        }

        const positionsInChunk = cache.get(chunk) ?? new Map<number | string, number>();
        positionsInChunk.set(position, index % 16);
        cache.set(chunk, positionsInChunk);
    }
    for (const [index, at] of redstonePositions.entries()) {
        let chunk: number | string;
        let position: number | string;
        if (indexed) {
            ({ chunk, position } = blockPositionKeys(at.x, at.y, at.z));
        } else {
            chunk = `${at.x >> 4},${at.z >> 4}`;
            position = `${at.x},${at.y},${at.z}`;
        }
        digest = (digest + (cache.get(chunk)?.get(position) ?? 0)) | 0;
        if (index % 4 === 0 && cache.get(chunk)?.delete(position)) invalidations++;
        const chunkToForget = indexed ? coordinatePairKey(at.x >> 4, at.z >> 4) : `${at.x >> 4},${at.z >> 4}`;
        if (index % 128 === 0 && cache.delete(chunkToForget)) invalidations++;
    }
    return { ms: performance.now() - started, invalidations, digest };
};

const median = (values: readonly number[]): number => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

for (let warmup = 0; warmup < WARMUPS; warmup++) {
    for (const mixed of [false, true]) {
        measureScheduler(false, mixed);
        measureScheduler(true, mixed);
    }
    measureRedstoneCache(false);
    measureRedstoneCache(true);
}

const schedulerResults = [false, true].map((indexed) => ({
    indexed,
    allFuture: Array.from({ length: SAMPLES }, () => measureScheduler(indexed, false)),
    mixed: Array.from({ length: SAMPLES }, () => measureScheduler(indexed, true))
}));
const redstoneResults = [false, true].map((indexed) => ({
    indexed,
    runs: Array.from({ length: SAMPLES }, () => measureRedstoneCache(indexed))
}));

const row = <T, K extends keyof T>(runs: readonly (T & { readonly [P in K]: number })[], field: K) =>
    median(runs.map((run) => run[field]));
for (const scenario of ['allFuture', 'mixed'] as const) {
    const baseline = schedulerResults.find(({ indexed }) => !indexed)![scenario];
    const numeric = schedulerResults.find(({ indexed }) => indexed)![scenario];
    if (baseline.some((run, index) => run.digest !== numeric[index]?.digest))
        throw new Error(`Scheduler ${scenario} outputs differ: ${JSON.stringify({ baseline, numeric })}`);
}
const baselineRedstone = redstoneResults.find(({ indexed }) => !indexed)!.runs;
const indexedRedstone = redstoneResults.find(({ indexed }) => indexed)!.runs;
if (baselineRedstone.some((run, index) => run.digest !== indexedRedstone[index]?.digest))
    throw new Error('Redstone cache reads differ');

process.stdout.write(
    `${JSON.stringify({
        benchmark: 'world-map-coordinate-keys',
        node: process.version,
        platform: `${os.platform()}-${os.arch()}`,
        cpu: os.cpus()[0]?.model ?? 'unknown',
        entries: ENTRY_COUNT,
        samples: SAMPLES,
        scheduler: schedulerResults.map(({ indexed, allFuture, mixed }) => ({
            key: indexed ? 'numeric-key' : 'string',
            allFutureDueMsP50: row(allFuture, 'dueMs'),
            mixedDueMsP50: row(mixed, 'dueMs'),
            scheduleMsP50: row(allFuture, 'scheduleMs'),
            allFutureDueCount: allFuture[0]?.dueCount ?? 0,
            mixedDueCount: mixed[0]?.dueCount ?? 0
        })),
        redstoneCache: redstoneResults.map(({ indexed, runs }) => ({
            key: indexed ? 'numeric-key' : 'string',
            totalMsP50: row(runs, 'ms'),
            invalidations: runs[0]?.invalidations ?? 0
        }))
    })}\n`
);
