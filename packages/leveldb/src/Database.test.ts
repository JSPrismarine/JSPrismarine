import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { CompressionType } from './compression/Compression';
import { Database } from './Database';
import { DatabaseLockedError } from './Errors';
import { WriteBatch } from './format/WriteBatch';

/**
 * Every test gets its own directory. Vitest runs files in parallel forks, and two databases in one
 * directory is precisely the thing `DirectoryLock` exists to prevent.
 */
const directories: string[] = [];

const scratch = (): string => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-leveldb-'));
    directories.push(directory);
    return directory;
};

afterEach(() => {
    while (directories.length > 0) fs.rmSync(directories.pop()!, { recursive: true, force: true });
});

const key = (text: string) => Buffer.from(text);
const chunkKeys = (count: number) =>
    Array.from({ length: count }, (_, i) => key(`chunk:${String(i).padStart(6, '0')}`));

describe('leveldb', () => {
    describe('Database', () => {
        describe('basics', () => {
            it('stores and reads back a value', async () => {
                const db = await Database.open(scratch());
                db.put(key('~local_player'), key('payload'));

                expect(db.get(key('~local_player'))).toEqual(key('payload'));
                await db.close();
            });

            it('reports nothing for a key it never saw', async () => {
                const db = await Database.open(scratch());

                expect(db.get(key('absent'))).toBeNull();
                expect(db.has(key('absent'))).toBe(false);
                await db.close();
            });

            it('overwrites a key rather than keeping both', async () => {
                const db = await Database.open(scratch());
                db.put(key('k'), key('first'));
                db.put(key('k'), key('second'));

                expect(db.get(key('k'))).toEqual(key('second'));
                expect([...db.entries()]).toHaveLength(1);
                await db.close();
            });

            it('deletes a key', async () => {
                const db = await Database.open(scratch());
                db.put(key('k'), key('v'));
                db.del(key('k'));

                expect(db.get(key('k'))).toBeNull();
                expect([...db.keys()]).toHaveLength(0);
                await db.close();
            });

            it('applies a batch as one unit', async () => {
                const db = await Database.open(scratch());
                db.put(key('stale'), key('old'));
                db.write(new WriteBatch().put(key('a'), key('1')).put(key('b'), key('2')).del(key('stale')));

                expect(db.get(key('a'))).toEqual(key('1'));
                expect(db.get(key('b'))).toEqual(key('2'));
                expect(db.get(key('stale'))).toBeNull();
                await db.close();
            });

            it('stores binary keys and values, which is what chunk records are', async () => {
                const db = await Database.open(scratch());
                const binaryKey = Buffer.from([0xf6, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x00, 0x2f, 0xfc]);
                const value = Buffer.from([0x09, 0x01, 0x00, 0xff, 0x80]);
                db.put(binaryKey, value);

                expect(db.get(binaryKey)).toEqual(value);
                await db.close();
            });

            it('stores an empty value', async () => {
                const db = await Database.open(scratch());
                db.put(key('empty'), Buffer.alloc(0));

                // Distinct from absent: a zero-length value is what several chunk records hold.
                expect(db.get(key('empty'))).toEqual(Buffer.alloc(0));
                expect(db.has(key('empty'))).toBe(true);
                await db.close();
            });
        });

        describe('iteration', () => {
            it('walks keys in order', async () => {
                const db = await Database.open(scratch());
                for (const k of [key('c'), key('a'), key('b')]) db.put(k, key('v'));

                expect([...db.keys()].map(String)).toEqual(['a', 'b', 'c']);
                await db.close();
            });

            it('skips deleted keys', async () => {
                const db = await Database.open(scratch());
                for (const k of [key('a'), key('b'), key('c')]) db.put(k, key('v'));
                db.del(key('b'));

                expect([...db.keys()].map(String)).toEqual(['a', 'c']);
                await db.close();
            });

            it('honours a range', async () => {
                const db = await Database.open(scratch());
                for (const k of chunkKeys(100)) db.put(k, key('v'));

                const range = [...db.keys({ gte: key('chunk:000030'), lt: key('chunk:000040') })];
                expect(range).toHaveLength(10);
                expect(range[0]).toEqual(key('chunk:000030'));
                expect(range.at(-1)).toEqual(key('chunk:000039'));
                await db.close();
            });

            it('merges the memtable over the tables', async () => {
                const directory = scratch();
                const db = await Database.open(directory);
                db.put(key('a'), key('from table'));
                db.put(key('b'), key('from table'));
                await db.flush();

                db.put(key('a'), key('from memory'));
                db.del(key('b'));
                db.put(key('c'), key('from memory'));

                expect([...db.entries()].map(([k, v]) => `${k}=${v}`)).toEqual(['a=from memory', 'c=from memory']);
                await db.close();
            });
        });

        describe('persistence', () => {
            it('survives a clean close and reopen', async () => {
                const directory = scratch();
                const first = await Database.open(directory);
                for (const k of chunkKeys(200)) first.put(k, Buffer.concat([key('value for '), k]));
                await first.close();

                const second = await Database.open(directory);
                expect([...second.keys()]).toHaveLength(200);
                expect(second.get(key('chunk:000100'))).toEqual(key('value for chunk:000100'));
                await second.close();
            });

            it('replays the log when the database was never closed', async () => {
                // What a crash looks like: the data reached the write-ahead log but was never
                // turned into a table. Recovery has to find it there.
                const directory = scratch();
                const crashed = await Database.open(directory);
                crashed.put(key('written'), key('before the crash'));
                crashed.del(key('written'));
                crashed.put(key('written'), key('and again'));

                const reopened = await Database.open(directory, { readOnly: true });
                expect(reopened.get(key('written'))).toEqual(key('and again'));
                await reopened.close();
                await crashed.close();
            });

            it('keeps deletions across a reopen', async () => {
                const directory = scratch();
                const first = await Database.open(directory);
                first.put(key('gone'), key('v'));
                await first.flush();
                first.del(key('gone'));
                await first.close();

                const second = await Database.open(directory);
                expect(second.get(key('gone'))).toBeNull();
                await second.close();
            });

            it('never reuses a sequence number or a file number across reopens', async () => {
                // Understating either would let a later writer - the game included - reuse them
                // and silently shadow what we wrote.
                const directory = scratch();
                let previousSequence = -1n;
                const everSeen = new Set<string>();
                const retired = new Set<string>();

                const tables = (): Set<string> =>
                    new Set(fs.readdirSync(directory).filter((name) => name.endsWith('.ldb')));

                for (let round = 0; round < 5; round++) {
                    const db = await Database.open(directory);
                    expect(db.stats.lastSequence).toBeGreaterThanOrEqual(previousSequence);

                    db.put(key(`round:${round}`), key('v'));
                    await db.flush();
                    previousSequence = db.stats.lastSequence;
                    await db.close();

                    const present = tables();

                    // A file number handed out again after its file was deleted would let a later
                    // writer - the game included - shadow live data with a stale name.
                    for (const name of present) expect(retired.has(name)).toBe(false);
                    for (const name of everSeen) if (!present.has(name)) retired.add(name);
                    for (const name of present) everSeen.add(name);
                }

                const db = await Database.open(directory);
                expect([...db.keys()]).toHaveLength(5);
                await db.close();
            });

            it('leaves exactly one manifest and one CURRENT pointing at it', async () => {
                const directory = scratch();
                const db = await Database.open(directory);
                for (const k of chunkKeys(50)) db.put(k, key('v'));
                await db.flush();
                await db.close();

                const manifests = fs.readdirSync(directory).filter((name) => name.startsWith('MANIFEST-'));
                expect(manifests).toHaveLength(1);
                expect(fs.readFileSync(path.join(directory, 'CURRENT'), 'utf8').trim()).toBe(manifests[0]);
            });
        });

        describe('flushing and compaction', () => {
            it('turns the memtable into a table on flush', async () => {
                const db = await Database.open(scratch());
                for (const k of chunkKeys(100)) db.put(k, key('v'));
                expect(db.stats.totalFiles).toBe(0);

                await db.flush();

                expect(db.stats.totalFiles).toBeGreaterThan(0);
                expect(db.stats.memtableBytes).toBe(0);
                await db.close();
            });

            it('flushes on its own once the write buffer fills', async () => {
                const db = await Database.open(scratch(), { writeBufferSize: 8 * 1024 });
                for (const k of chunkKeys(500)) db.put(k, Buffer.alloc(256, 0x41));

                expect(db.stats.totalFiles).toBeGreaterThan(0);
                expect([...db.keys()]).toHaveLength(500);
                await db.close();
            });

            it('merges level 0 into level 1 without losing a key', async () => {
                const directory = scratch();
                const db = await Database.open(directory, { l0CompactionTrigger: 2, maxFileSize: 16 * 1024 });

                const expected = new Map<string, string>();
                for (let round = 0; round < 6; round++) {
                    for (let i = 0; i < 200; i++) {
                        const k = `key:${String((round * 97 + i * 13) % 1000).padStart(4, '0')}`;
                        expected.set(k, `round ${round}`);
                        db.put(key(k), key(`round ${round}`));
                    }

                    await db.flush();
                }

                expect(db.levelSizes[1]).toBeGreaterThan(0);
                expect([...db.entries()].map(([k, v]) => `${k}=${v}`).sort()).toEqual(
                    [...expected].map(([k, v]) => `${k}=${v}`).sort()
                );

                await db.close();

                const reopened = await Database.open(directory);
                expect([...reopened.keys()]).toHaveLength(expected.size);
                await reopened.close();
            });

            it('keeps level 1 a sorted run with no overlaps', async () => {
                // The invariant every reader depends on, the game's included: a lookup binary
                // searches one file per level below zero, which only works if they do not overlap.
                const db = await Database.open(scratch(), { l0CompactionTrigger: 2, maxFileSize: 8 * 1024 });

                for (let round = 0; round < 5; round++) {
                    for (let i = 0; i < 300; i++)
                        db.put(key(`k:${String((i * 7 + round) % 2000).padStart(5, '0')}`), Buffer.alloc(64, round));
                    await db.flush();
                }

                // `flush` runs assertSortedRuns after every compaction; getting here is the check.
                expect(db.levelSizes[1]).toBeGreaterThan(1);
                await db.close();
            });

            it('drops a deleted key entirely once it reaches level 1', async () => {
                const db = await Database.open(scratch(), { l0CompactionTrigger: 2 });
                db.put(key('doomed'), key('v'));
                await db.flush();
                db.del(key('doomed'));
                await db.flush();
                db.put(key('other'), key('v'));
                await db.flush();

                expect(db.get(key('doomed'))).toBeNull();
                expect([...db.keys()].map(String)).toEqual(['other']);
                await db.close();
            });
        });

        describe('locking', () => {
            it('refuses a second writer on the same directory', async () => {
                const directory = scratch();
                const first = await Database.open(directory);

                await expect(Database.open(directory)).rejects.toThrow(DatabaseLockedError);
                await first.close();
            });

            it('lets a writer back in once the first one closed', async () => {
                const directory = scratch();
                await (await Database.open(directory)).close();

                const second = await Database.open(directory);
                expect(second.stats.totalFiles).toBe(0);
                await second.close();
            });

            it('reopens after a hard kill, and still has what reached the log', async () => {
                // A server killed with no chance to close leaves its LOCK behind. Refusing to start
                // until someone deletes it by hand is not a thing a server may do.
                //
                // Killed for real, in a child process: simulating it from here would only exercise
                // the same-process guard, which is a different mechanism.
                const directory = scratch();
                const built = path.resolve(import.meta.dirname, '..', 'dist', 'index.es.js');
                if (!fs.existsSync(built)) {
                    throw new Error(`This test needs the built package at ${built} - run its build first`);
                }

                const child = spawn(
                    process.execPath,
                    [
                        '--input-type=module',
                        '-e',
                        `import { Database } from ${JSON.stringify(pathToFileURL(built).href)};
                         const db = await Database.open(${JSON.stringify(directory)});
                         db.put(Buffer.from('written'), Buffer.from('before the kill'));
                         console.log('ready');
                         setInterval(() => {}, 1000);`
                    ],
                    { stdio: ['ignore', 'pipe', 'inherit'] }
                );

                await new Promise<void>((resolve, reject) => {
                    child.stdout.on('data', (chunk: Buffer) => {
                        if (chunk.toString().includes('ready')) resolve();
                    });
                    child.on('error', reject);
                    child.on('exit', (code) => reject(new Error(`child exited early with ${code}`)));
                });

                child.kill('SIGKILL');
                await new Promise((resolve) => child.on('exit', resolve));

                // The lock is still there, naming a process that no longer exists.
                expect(fs.existsSync(path.join(directory, 'LOCK'))).toBe(true);

                const restarted = await Database.open(directory);
                expect(restarted.get(key('written'))).toEqual(key('before the kill'));
                await restarted.close();
            });

            it('opens a world whose LOCK the game left behind', async () => {
                // Minecraft locks the file with fcntl and never writes to it, so every world it
                // has opened carries a zero byte LOCK. Reading it as "in use" would mean refusing
                // every world made in the game.
                const directory = scratch();
                await (await Database.open(directory)).close();
                fs.writeFileSync(path.join(directory, 'LOCK'), '');

                const opened = await Database.open(directory);
                expect(opened.stats.totalFiles).toBe(0);
                await opened.close();
            });

            it('lets a read-only reader in alongside a writer', async () => {
                const directory = scratch();
                const writer = await Database.open(directory);
                writer.put(key('k'), key('v'));
                await writer.flush();

                const reader = await Database.open(directory, { readOnly: true });
                expect(reader.get(key('k'))).toEqual(key('v'));
                expect(() => reader.put(key('x'), key('y'))).toThrow(/read-only/);
                await reader.close();
                await writer.close();
            });

            it('leaves no lock file behind after a close', async () => {
                const directory = scratch();
                await (await Database.open(directory)).close();

                expect(fs.existsSync(path.join(directory, 'LOCK'))).toBe(false);
            });
        });

        describe('options', () => {
            it('refuses to create a database when told not to', async () => {
                await expect(
                    Database.open(path.join(scratch(), 'missing'), { createIfMissing: false })
                ).rejects.toThrow(/No database/);
            });

            it('refuses to reopen a database when told it must not exist', async () => {
                const directory = scratch();
                await (await Database.open(directory)).close();

                await expect(Database.open(directory, { errorIfExists: true })).rejects.toThrow(/already exists/);
            });

            it('round-trips under every compression type it can write', async () => {
                for (const compression of [CompressionType.None, CompressionType.Zlib, CompressionType.ZlibRaw]) {
                    const directory = scratch();
                    const db = await Database.open(directory, { compression });
                    for (const k of chunkKeys(300)) db.put(k, Buffer.alloc(128, 0x5a));
                    await db.close();

                    const reopened = await Database.open(directory);
                    expect([...reopened.keys()]).toHaveLength(300);
                    await reopened.close();
                }
            });

            it('refuses to be used after close', async () => {
                const db = await Database.open(scratch());
                await db.close();

                expect(() => db.get(key('k'))).toThrow(/closed/);
            });
        });

        describe('scale', () => {
            it('handles a world-sized key set through a close and reopen', async () => {
                const directory = scratch();
                const db = await Database.open(directory, {
                    writeBufferSize: 64 * 1024,
                    maxFileSize: 128 * 1024,
                    l0CompactionTrigger: 3
                });

                // Roughly what a few hundred chunks of sub-chunk records look like.
                const count = 5000;
                for (let i = 0; i < count; i++) {
                    const chunkKey = Buffer.alloc(10);
                    chunkKey.writeInt32LE(i % 64, 0);
                    chunkKey.writeInt32LE(Math.floor(i / 64), 4);
                    chunkKey.writeUInt8(0x2f, 8);
                    chunkKey.writeInt8((i % 24) - 4, 9);
                    db.put(chunkKey, Buffer.alloc(512, i & 0xff));
                }

                await db.close();

                const reopened = await Database.open(directory);
                expect([...reopened.keys()]).toHaveLength(count);

                const probe = Buffer.alloc(10);
                probe.writeInt32LE(7, 0);
                probe.writeInt32LE(0, 4);
                probe.writeUInt8(0x2f, 8);
                probe.writeInt8(3, 9);
                expect(reopened.get(probe)).toEqual(Buffer.alloc(512, 7));
                await reopened.close();
            });
        });
    });
});
