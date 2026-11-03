/**
 * Compares string coordinate keys with the production numeric coordinate indexes.
 *
 * Run `pnpm --filter @jsprismarine/prismarine run bench:world-keys [entries] [samples]`. The
 * scheduler and entity-grid rows exercise production classes; redstone measures the same nested
 * key layout used by `contentRedstoneUpdateHandlers`.
 */
import os from 'node:os';

import type { Entity } from '../src/entity/Entity';
import { stub } from '../src/testing/stub.test.helper';
import { BlockUpdateScheduler } from '../src/world/BlockUpdateScheduler';
import CoordinateUtils from '../src/world/CoordinateUtils';
import EntityGrid from '../src/world/EntityGrid';
import { Position } from '../src/world/Position';
import { blockPositionKeys, coordinatePairKey } from '../src/world/positionKeys';
import type { World } from '../src/world/World';

const argumentsAfterScript = process.argv.slice(2).filter((argument) => argument !== '--');
const ENTRY_COUNT = Number.parseInt(argumentsAfterScript[0] ?? '20000', 10);
const SAMPLES = Number.parseInt(argumentsAfterScript[1] ?? '5', 10);
const WARMUPS = 2;
const CENTER_COUNT = 200;

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

interface EntityGridSample {
    readonly rebuildMs: number;
    readonly queryMs: number;
    readonly candidates: number;
    readonly digest: number;
}

const world = stub<World>({ getName: () => 'world map key benchmark' });
const entities: Entity[] = Array.from({ length: ENTRY_COUNT }, (_unused, index) => {
    const x = ((index * 37) % 8192) - 4096 + 0.25;
    const z = ((index * 97) % 8192) - 4096 + 0.75;
    const position = new Position(x, 64, z, world);
    return stub<Entity>({
        getRuntimeId: () => BigInt(index + 1),
        getType: () => 'minecraft:cow',
        getPosition: () => position
    });
});
const centers = Array.from({ length: CENTER_COUNT }, (_unused, index) => ({
    x: ((index * 193) % 8192) - 4096,
    z: ((index * 313) % 8192) - 4096
}));

const measureEntityGrid = (indexed: boolean): EntityGridSample => {
    const grid = indexed ? new EntityGrid() : undefined;
    const stringCells = indexed ? undefined : new Map<string, Entity[]>();
    const startedRebuild = performance.now();
    if (grid !== undefined) grid.rebuild(entities);
    else {
        for (const entity of entities) {
            const position = entity.getPosition();
            const chunkX = CoordinateUtils.fromBlockToChunk(position.getX());
            const chunkZ = CoordinateUtils.fromBlockToChunk(position.getZ());
            const key = `${chunkX},${chunkZ}`;
            const cell = stringCells!.get(key);
            if (cell === undefined) stringCells!.set(key, [entity]);
            else cell.push(entity);
        }
    }
    const rebuildMs = performance.now() - startedRebuild;

    let candidates = 0;
    let digest = 0;
    const startedQuery = performance.now();
    for (const center of centers) {
        const found: Entity[] = [];
        if (grid !== undefined) found.push(...grid.near(center.x, center.z));
        else {
            const chunkX = CoordinateUtils.fromBlockToChunk(center.x);
            const chunkZ = CoordinateUtils.fromBlockToChunk(center.z);
            for (let offsetX = -1; offsetX <= 1; offsetX++)
                for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
                    const cell = stringCells!.get(`${chunkX + offsetX},${chunkZ + offsetZ}`);
                    if (cell !== undefined) found.push(...cell);
                }
        }
        candidates += found.length;
        for (const entity of found)
            digest = Math.imul(digest ^ Number(entity.getRuntimeId() & 0xffff_ffffn), 16_777_619) | 0;
    }
    const queryMs = performance.now() - startedQuery;
    return { rebuildMs, queryMs, candidates, digest };
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
    measureEntityGrid(false);
    measureEntityGrid(true);
    measureRedstoneCache(false);
    measureRedstoneCache(true);
}

const schedulerResults = [false, true].map((indexed) => ({
    indexed,
    allFuture: Array.from({ length: SAMPLES }, () => measureScheduler(indexed, false)),
    mixed: Array.from({ length: SAMPLES }, () => measureScheduler(indexed, true))
}));
const entityResults = [false, true].map((indexed) => ({
    indexed,
    runs: Array.from({ length: SAMPLES }, () => measureEntityGrid(indexed))
}));
const redstoneResults = [false, true].map((indexed) => ({
    indexed,
    runs: Array.from({ length: SAMPLES }, () => measureRedstoneCache(indexed))
}));

const row = (runs: readonly { readonly [key: string]: number }[], field: string) =>
    median(runs.map((run) => run[field] ?? 0));
for (const scenario of ['allFuture', 'mixed'] as const) {
    const baseline = schedulerResults.find(({ indexed }) => !indexed)![scenario];
    const numeric = schedulerResults.find(({ indexed }) => indexed)![scenario];
    if (baseline.some((run, index) => run.digest !== numeric[index]?.digest))
        throw new Error(`Scheduler ${scenario} outputs differ: ${JSON.stringify({ baseline, numeric })}`);
}
const baselineEntity = entityResults.find(({ indexed }) => !indexed)!.runs;
const indexedEntity = entityResults.find(({ indexed }) => indexed)!.runs;
if (baselineEntity.some((run, index) => run.digest !== indexedEntity[index]?.digest))
    throw new Error('Entity-grid candidate arrays differ');
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
        entityGrid: entityResults.map(({ indexed, runs }) => ({
            key: indexed ? 'numeric-key' : 'string',
            rebuildMsP50: row(runs, 'rebuildMs'),
            queryMsP50: row(runs, 'queryMs'),
            candidates: runs[0]?.candidates ?? 0
        })),
        redstoneCache: redstoneResults.map(({ indexed, runs }) => ({
            key: indexed ? 'numeric-key' : 'string',
            totalMsP50: row(runs, 'ms'),
            invalidations: runs[0]?.invalidations ?? 0
        }))
    })}\n`
);
