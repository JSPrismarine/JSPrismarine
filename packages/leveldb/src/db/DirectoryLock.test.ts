import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { DatabaseLockedError } from '../Errors';
import { DirectoryLock } from './DirectoryLock';

const directories: string[] = [];

const scratch = (): string => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-lock-'));
    directories.push(directory);
    return directory;
};

afterEach(() => {
    while (directories.length > 0) fs.rmSync(directories.pop()!, { recursive: true, force: true });
});

const lockFile = (directory: string) => path.join(directory, 'LOCK');

/** A pid that cannot be running: the kernel would have to be it. */
const DEAD_PID = 999_999_998;

describe('leveldb', () => {
    describe('DirectoryLock', () => {
        it('takes a lock where there is none', () => {
            const directory = scratch();
            const lock = DirectoryLock.acquire(directory);

            expect(fs.existsSync(lockFile(directory))).toBe(true);
            expect(fs.readFileSync(lockFile(directory), 'utf8')).toContain(String(process.pid));
            lock.release();
        });

        it('removes the file on release', () => {
            const directory = scratch();
            DirectoryLock.acquire(directory).release();

            expect(fs.existsSync(lockFile(directory))).toBe(false);
        });

        it('refuses a second lock while the first is held', () => {
            const directory = scratch();
            const first = DirectoryLock.acquire(directory);

            expect(() => DirectoryLock.acquire(directory)).toThrow(DatabaseLockedError);
            first.release();
        });

        it('names the process holding it', () => {
            const directory = scratch();
            const first = DirectoryLock.acquire(directory);

            expect(() => DirectoryLock.acquire(directory)).toThrow(new RegExp(`process ${process.pid}`));
            first.release();
        });

        describe('stale locks', () => {
            it('takes over one whose process is gone', () => {
                // The reported case: the server was killed before it could clean up, and every
                // restart after that refused to start.
                const directory = scratch();
                fs.writeFileSync(lockFile(directory), `${DEAD_PID} ${os.hostname()}\n`);

                const lock = DirectoryLock.acquire(directory);

                expect(fs.readFileSync(lockFile(directory), 'utf8')).toContain(String(process.pid));
                lock.release();
            });

            it('takes over the empty one Minecraft leaves behind', () => {
                // The game locks the file with fcntl and never writes to it, so a zero byte LOCK
                // is the *normal* state of any world it has ever opened. Refusing on its presence
                // would mean refusing every such world.
                const directory = scratch();
                fs.writeFileSync(lockFile(directory), '');

                const lock = DirectoryLock.acquire(directory);

                expect(fs.readFileSync(lockFile(directory), 'utf8')).toContain(String(process.pid));
                lock.release();
            });

            it('takes over one holding something that is not a process id', () => {
                for (const contents of ['\n', 'not a pid', '0', '-1', '  ']) {
                    const directory = scratch();
                    fs.writeFileSync(lockFile(directory), contents);

                    const lock = DirectoryLock.acquire(directory);
                    expect(fs.readFileSync(lockFile(directory), 'utf8')).toContain(String(process.pid));
                    lock.release();
                }
            });

            it('refuses one whose process is still running', () => {
                const directory = scratch();
                fs.writeFileSync(lockFile(directory), `${process.pid + 0} ${os.hostname()}\n`);

                // Our own pid reads as "not us, and alive" only for a different process; using our
                // own would be indistinguishable from a re-entrant acquire, so use the parent's.
                fs.writeFileSync(lockFile(directory), `${process.ppid} ${os.hostname()}\n`);

                expect(() => DirectoryLock.acquire(directory)).toThrow(DatabaseLockedError);
            });

            it('refuses one taken on another machine', () => {
                // Shared storage: the pid says nothing about a process on a different host, and
                // guessing wrong costs the world rather than a restart.
                const directory = scratch();
                fs.writeFileSync(lockFile(directory), `${DEAD_PID} some-other-host\n`);

                expect(() => DirectoryLock.acquire(directory)).toThrow(DatabaseLockedError);
            });

            it('leaves the rest of the database alone when it takes over', () => {
                const directory = scratch();
                fs.writeFileSync(lockFile(directory), `${DEAD_PID} ${os.hostname()}\n`);
                fs.writeFileSync(path.join(directory, 'CURRENT'), 'MANIFEST-000001\n');

                DirectoryLock.acquire(directory).release();

                expect(fs.readFileSync(path.join(directory, 'CURRENT'), 'utf8')).toBe('MANIFEST-000001\n');
            });
        });
    });
});
