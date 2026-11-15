/**
 * `@jsprismarine/leveldb` against the pinned Bedrock Dedicated Server, in both directions.
 *
 * Every other LevelDB test checks our reader against our writer, which cannot catch a mistake the
 * two share. This one has the game's own engine write a world for us to read, then load a world
 * we wrote, then save over it for us to read again.
 *
 * 1. The server generates a world with marker blocks above and below y = 0, so sub chunk keys
 *    with negative indices exist, and a scoreboard. Every key in every table it wrote must come
 *    back from that table's point lookup, which runs through the server's own Bloom filters.
 * 2. We rewrite every record into a database of our own, spread over several levels, and leave
 *    the marker chunk in the log of a database that was never closed, as a crash leaves it. The
 *    server has to find each marker and the scoreboard.
 * 3. We read what the server saved on top of our files, in the same test as step 2.
 *
 * It boots the server twice and generates about a thousand chunks, so it takes minutes and runs
 * only when asked: `JSP_BEDROCK_SERVER_TESTS=1`, with the pinned server fetched by
 * `pnpm --filter @jsprismarine/bedrock-data run fetch:sources`, or `JSP_BDS_PATH` pointing at
 * one. CI runs it in its own job.
 *
 * ```sh
 * JSP_BEDROCK_SERVER_TESTS=1 pnpm exec vitest run packages/bedrock-data/utils/bedrock-dump/leveldbCompat.test.ts
 * ```
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { Database, WriteBatch } from '@jsprismarine/leveldb';
import { TableFile } from '@jsprismarine/leveldb/db/Storage';
import { compareInternalKeys, extractUserKey } from '@jsprismarine/leveldb/format/InternalKey';
import { TableReader } from '@jsprismarine/leveldb/format/TableReader';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bedrockServerPath } from '../fetch/bds.ts';
import { cacheRoot } from '../fetch/paths.ts';
import { launcherForHost } from './runner.ts';
import type { ProbeCommand, ServerLauncher } from './runner.ts';
import { READY_LINE, stageServer, startServer } from './server.ts';
import type { RunningServer } from './server.ts';

const enabled = process.env.JSP_BEDROCK_SERVER_TESTS === '1';

/** Budgets for a native run; a container that emulates x86-64 multiplies them. */
const BOOT_MS = 120_000;
const LOAD_MS = 600_000;
const STOP_MS = 120_000;
const STEP_MS = 20 * 60_000;

/** Ten areas of 10 by 10 chunks, the most ticking areas a world allows at the largest size. */
const AREAS = Array.from({ length: 10 }, (_, i) => ({ x: (i % 5) * 160, z: Math.floor(i / 5) * 160 }));

/** Blocks placed in the first area, in sub chunks above and below y = 0. */
const MARKERS = [
    { x: 1, y: -60, z: 1, block: 'diamond_block' },
    { x: 17, y: -50, z: 33, block: 'gold_block' },
    { x: 40, y: 70, z: 40, block: 'emerald_block' },
    { x: 62, y: 200, z: 5, block: 'lapis_block' }
] as const;

const runProbe: ProbeCommand = (command, args) => {
    const result = spawnSync(command, [...args], { encoding: 'utf8' });
    return {
        status: result.error !== undefined ? null : result.status,
        stdout: result.stdout ?? '',
        stderr: result.error !== undefined ? result.error.message : (result.stderr ?? '')
    };
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends a console command and returns the first line printed after it that `matches` accepts. */
const ask = (server: RunningServer, command: string, matches: RegExp, timeoutMs = 60_000): Promise<string> => {
    const from = server.lines.length;
    server.send(command);
    return server.waitForLine((line) => matches.test(line), command, timeoutMs, from);
};

/** Repeats a command until the chunk it reaches is loaded, and returns the answer it gave then. */
const askLoaded = async (server: RunningServer, command: string, timeoutMs: number): Promise<string> => {
    const until = Date.now() + timeoutMs;
    for (;;) {
        const line = await ask(
            server,
            command,
            /Successfully found|The block at|Block placed|already|not loaded|outside|Cannot (test|place)/i
        );
        if (!/not loaded|Cannot (test|place)/i.test(line)) return line;
        if (Date.now() > until) throw new Error(`The chunk for \`${command}\` never loaded: ${line}`);
        await sleep(2000);
    }
};

/** A chunk record key: x, z, tag and an optional signed sub chunk index. Overworld keys carry no dimension. */
const chunkKey = (x: number, z: number, tag: number, subChunk?: number): Buffer => {
    const key = Buffer.alloc(subChunk === undefined ? 9 : 10);
    key.writeInt32LE(x, 0);
    key.writeInt32LE(z, 4);
    key.writeUInt8(tag, 8);
    if (subChunk !== undefined) key.writeInt8(subChunk, 9);
    return key;
};

const SUB_CHUNK_PREFIX = 0x2f;

interface ReadBack {
    /** Live keys a full scan yields. */
    keys: number;
    /** Scanned keys whose point read returned something else. */
    mismatches: string[];
    /** Entries across every table file, each looked up in its own table. */
    tableEntries: number;
    /** Table entries their table's point lookup, Bloom filter included, did not find. */
    tableMisses: string[];
    /** Table entries whose filter hashes bytes of 0x80 or more: a signed `char` would hash those differently. */
    highTailEntries: number;
    database: Database;
}

/** Reads a database every way there is and reports what disagreed. */
const readBack = async (directory: string): Promise<ReadBack> => {
    let tableEntries = 0;
    let highTailEntries = 0;
    const tableMisses: string[] = [];
    for (const name of readdirSync(directory).filter((entry) => entry.endsWith('.ldb'))) {
        const file = new TableFile(join(directory, name));
        try {
            const table = new TableReader(file, compareInternalKeys);
            for (const entry of table.entries()) {
                const userKey = extractUserKey(entry.key);
                tableEntries++;
                // The filter hashes the bytes past the last whole 4 byte word one at a time.
                if (userKey.subarray(userKey.byteLength - (userKey.byteLength % 4)).some((byte) => byte >= 0x80)) {
                    highTailEntries++;
                }
                const found = table.lookup(entry.key, userKey);
                if (found === null || !found.key.equals(entry.key))
                    tableMisses.push(`${name}:${userKey.toString('hex')}`);
            }
        } finally {
            file.close();
        }
    }

    const database = await Database.open(directory, { readOnly: true, createIfMissing: false });
    let keys = 0;
    const mismatches: string[] = [];
    for (const [key, value] of database.entries()) {
        keys++;
        if (!database.get(key)?.equals(value)) mismatches.push(key.toString('hex'));
    }

    return { keys, mismatches, tableEntries, tableMisses, highTailEntries, database };
};

describe.skipIf(!enabled)('LevelDB against the pinned Bedrock Dedicated Server', { tags: ['bedrock-server'] }, () => {
    let launcher: ServerLauncher;
    let unpacked: string;
    let scratch: string;
    let scale = 1;

    /** Stages the server on `world`, or on a new world when it is absent, and starts it. */
    const boot = async (levelName: string, world?: string): Promise<{ server: RunningServer; directory: string }> => {
        const staged = await stageServer({
            unpacked,
            // Its own run directory, so this never stages over a capture's.
            root: join(cacheRoot, 'bds-run', `${basename(dirname(unpacked))}-leveldb`),
            levelName,
            properties: {
                'level-seed': '1234',
                gamemode: 'creative',
                'server-port': '19632',
                'server-portv6': '19633',
                'content-log-console-output-enabled': 'false'
            }
        });
        if (world !== undefined) {
            rmSync(staged.worldDirectory, { recursive: true, force: true });
            cpSync(world, staged.worldDirectory, { recursive: true });
        }

        const server = startServer({ ...launcher.launch(staged.root), cwd: staged.root });
        try {
            await server.waitForLine((line) => line.includes(READY_LINE), 'the ready line', BOOT_MS * scale);
        } catch (error) {
            // A server that never got ready is still running; leaving it would hold the next run's ports.
            await server.stop(STOP_MS * scale).catch(() => null);
            launcher.cleanup();
            throw error;
        }
        return { server, directory: staged.worldDirectory };
    };

    /** Stops the server, which is when it saves, and keeps a copy of the world it saved. */
    const stopAndKeep = async (server: RunningServer, directory: string, name: string): Promise<string> => {
        try {
            expect(await server.stop(STOP_MS * scale)).toBe(0);
        } finally {
            launcher.cleanup();
        }
        const kept = join(scratch, name);
        cpSync(directory, kept, { recursive: true });
        return kept;
    };

    /** Warnings and errors the server printed about its database. */
    const storageErrors = (server: RunningServer): string[] =>
        server.lines.filter((line) => /\b(WARN|ERROR)\b/.test(line) && /leveldb|corrupt|checksum|\bdb\b/i.test(line));

    let vanilla: string;

    beforeAll(async () => {
        unpacked = await bedrockServerPath();
        if (!existsSync(join(unpacked, 'bedrock_server'))) {
            throw new Error(
                `No Bedrock Dedicated Server at ${unpacked}. Run \`pnpm --filter @jsprismarine/bedrock-data run ` +
                    'fetch:sources`, or set JSP_BDS_PATH to an unpacked server of the pinned version.'
            );
        }
        launcher = launcherForHost(runProbe);
        launcher.ensureImage();
        scale = launcher.timeoutScale;
        scratch = mkdtempSync(join(tmpdir(), 'jsp-leveldb-bds-'));

        const { server, directory } = await boot('jsp-vanilla');
        try {
            for (const [i, area] of AREAS.entries()) {
                expect(
                    await ask(
                        server,
                        `tickingarea add ${area.x} 0 ${area.z} ${area.x + 159} 0 ${area.z + 159} jsp${i}`,
                        /ticking area/i
                    )
                ).toMatch(/Added ticking area/);
            }
            // A chunk the bedrock floor of reads as loaded has been generated, and is saved on stop.
            for (const area of AREAS) {
                await askLoaded(server, `testforblock ${area.x + 159} -64 ${area.z + 159} bedrock`, LOAD_MS * scale);
            }
            for (const { x, y, z, block } of MARKERS) {
                expect(await askLoaded(server, `setblock ${x} ${y} ${z} ${block}`, LOAD_MS * scale)).toMatch(/placed/i);
            }
            await ask(server, 'scoreboard objectives add jsptest dummy', /objective/i);
            await ask(server, 'scoreboard players set alpha jsptest 42', /jsptest/i);
            // The server flushes a table once its write buffer fills. Until it has, there would be
            // no filter of the server's for the first check to read.
            const until = Date.now() + LOAD_MS * scale;
            while (!readdirSync(join(directory, 'db')).some((name) => name.endsWith('.ldb'))) {
                if (Date.now() > until) throw new Error('The server generated its areas without writing a table.');
                await sleep(2000);
            }
            expect(storageErrors(server)).toEqual([]);
        } finally {
            vanilla = await stopAndKeep(server, directory, 'vanilla');
        }
    }, STEP_MS);

    afterAll(() => {
        if (scratch !== undefined) rmSync(scratch, { recursive: true, force: true });
    });

    it(
        'reads every key the server wrote, through the server’s own Bloom filters',
        async () => {
            const read = await readBack(join(vanilla, 'db'));
            try {
                // Without a table the filter check would pass by checking nothing.
                expect(read.tableEntries).toBeGreaterThan(0);
                expect(read.highTailEntries).toBeGreaterThan(0);
                expect(read.tableMisses).toEqual([]);
                expect(read.mismatches).toEqual([]);
                for (const { x, y, z } of MARKERS) {
                    expect(read.database.has(chunkKey(x >> 4, z >> 4, SUB_CHUNK_PREFIX, y >> 4))).toBe(true);
                }
            } finally {
                await read.database.close();
            }
        },
        STEP_MS
    );

    it(
        'writes a world the server loads, with writes it has to replay from our log, and reads back what it saved',
        async () => {
            const source = await Database.open(join(vanilla, 'db'), { readOnly: true, createIfMissing: false });
            const entries = [...source.entries()];
            await source.close();

            // Small buffers and files, so the world spreads over several levels and compactions.
            const written = join(scratch, 'written');
            const database = await Database.open(written, {
                writeBufferSize: 96 * 1024,
                maxFileSize: 48 * 1024,
                l0CompactionTrigger: 2
            });
            const isMarkerChunk = (key: Buffer): boolean =>
                (key.byteLength === 9 || key.byteLength === 10) && key.readInt32LE(0) === 0 && key.readInt32LE(4) === 0;
            const deferred = new WriteBatch();
            let batch = new WriteBatch();
            // A fixed shuffle, so flushes produce level 0 files whose ranges overlap.
            for (let i = entries.length - 1; i > 0; i--) {
                const j = (i * 2654435761) % (i + 1);
                [entries[i], entries[j]] = [entries[j]!, entries[i]!];
            }
            for (const [key, value] of entries) {
                if (isMarkerChunk(key)) {
                    deferred.put(key, value);
                    continue;
                }
                batch.put(key, value);
                if (batch.count === 64) {
                    database.write(batch);
                    batch = new WriteBatch();
                }
            }
            database.write(batch);
            database.put(Buffer.from('jsp_deleted'), Buffer.from('x'));
            await database.flush();
            database.del(Buffer.from('jsp_deleted'));
            await database.flush();
            database.write(deferred, { sync: true });
            expect(deferred.count).toBeGreaterThan(0);
            expect(database.levelSizes.filter((files) => files > 0).length).toBeGreaterThanOrEqual(2);

            // A copy taken while the database is open is what a crash leaves: the marker chunk is
            // in the log alone.
            const ours = join(scratch, 'ours');
            cpSync(vanilla, ours, { recursive: true, filter: (path) => !path.startsWith(join(vanilla, 'db')) });
            mkdirSync(join(ours, 'db'));
            for (const name of readdirSync(written).filter((name) => name !== 'LOCK')) {
                cpSync(join(written, name), join(ours, 'db', name));
            }
            await database.close();

            const { server, directory } = await boot('jsp-ours', ours);
            let saved: string;
            try {
                for (const { x, y, z, block } of MARKERS) {
                    expect(await askLoaded(server, `testforblock ${x} ${y} ${z} ${block}`, LOAD_MS * scale)).toMatch(
                        /Successfully found/i
                    );
                }
                expect(await ask(server, 'scoreboard players list alpha', /jsptest/i)).toMatch(/jsptest: 42/);
                expect(storageErrors(server)).toEqual([]);
            } finally {
                saved = await stopAndKeep(server, directory, 'saved');
            }

            // What the server saved over our files, read back here so a run of this test alone
            // has the world it reads.
            const read = await readBack(join(saved, 'db'));
            try {
                expect(read.tableMisses).toEqual([]);
                expect(read.mismatches).toEqual([]);
                expect(read.database.get(Buffer.from('jsp_deleted'))).toBeNull();
                for (const { x, y, z } of MARKERS) {
                    expect(read.database.has(chunkKey(x >> 4, z >> 4, SUB_CHUNK_PREFIX, y >> 4))).toBe(true);
                }
            } finally {
                await read.database.close();
            }
        },
        STEP_MS
    );
});
