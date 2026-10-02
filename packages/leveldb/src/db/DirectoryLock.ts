import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DatabaseLockedError } from '../Errors';
import { LOCK_FILE_NAME } from '../util/FileNames';

/**
 * Holds a database directory against a second writer.
 *
 * Two writers on one LevelDB is not a race that produces a stale read. They rewrite `CURRENT` and
 * delete files out from under each other, and the world does not survive it. So this has to be
 * strict - but strict in the right direction, because there are two ways to get it wrong and both
 * of them are worse than doing nothing.
 *
 * # Why the file's existence cannot be the lock
 *
 * LevelDB takes an advisory `fcntl` lock on `LOCK` and never writes to it. The file therefore
 * *always* exists in a world the game has touched, and is zero bytes. Treating its presence as
 * "someone has this open" would mean refusing to open any world ever created in Minecraft, which
 * is the one thing this provider exists to do.
 *
 * And in the other direction: Node cannot take an `fcntl` lock, so a server killed with no chance
 * to clean up leaves its own `LOCK` behind, and refusing to start after a crash is not acceptable
 * either.
 *
 * # What actually gets checked
 *
 * The lock records the process that took it. On finding one, we ask whether that process is still
 * running: if it is, the database really is in use and we refuse; if it is not - or if the file
 * holds nothing to identify a process, which is what the game leaves - the lock is stale and we
 * take it over.
 *
 * The game holding a world open is still caught, on the platform where it can be: Windows opens
 * `LOCK` without sharing, so our own open fails at the OS level rather than with `EEXIST`, and
 * that is treated as a live lock whatever the file says.
 */

interface LockOwner {
    pid: number;
    hostname: string;
}

export class DirectoryLock {
    /**
     * The directories this process holds.
     *
     * A pid tells us nothing about ourselves - a second lock taken here would record our own pid,
     * which is alive by definition - so same-process conflicts are tracked directly instead. Two
     * `World`s configured onto one folder is a real way to get here, and it has to fail.
     */
    private static readonly held = new Set<string>();

    private readonly file: string;
    private readonly directory: string;
    private descriptor: number | null;

    private constructor(directory: string, file: string, descriptor: number) {
        this.directory = directory;
        this.file = file;
        this.descriptor = descriptor;
    }

    public static acquire(directory: string): DirectoryLock {
        const resolved = path.resolve(directory);
        const file = path.join(directory, LOCK_FILE_NAME);

        if (DirectoryLock.held.has(resolved)) {
            throw new DatabaseLockedError(directory, undefined, process.pid);
        }

        try {
            return DirectoryLock.create(resolved, file);
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;

            if (code !== 'EEXIST') {
                // EBUSY, EPERM or EACCES: something has the file open at the OS level and will not
                // share it. On Windows that is what a running Minecraft looks like.
                if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
                    throw new DatabaseLockedError(directory, error);
                }

                throw error;
            }

            const owner = DirectoryLock.readOwner(file);
            if (owner !== null && DirectoryLock.isRunning(owner)) {
                throw new DatabaseLockedError(directory, error, owner.pid);
            }

            return DirectoryLock.takeOver(resolved, file, directory, error);
        }
    }

    private static create(directory: string, file: string): DirectoryLock {
        const descriptor = fs.openSync(file, 'wx');
        fs.writeSync(descriptor, `${process.pid} ${os.hostname()}\n`);
        fs.fsyncSync(descriptor);

        DirectoryLock.held.add(directory);
        return new DirectoryLock(directory, file, descriptor);
    }

    /**
     * Replaces a lock whose owner is gone.
     *
     * Unlinked and re-created rather than truncated, so that two servers starting at the same
     * moment cannot both decide the lock is stale and both believe they hold it - whichever loses
     * the `wx` race sees `EEXIST` again and gives up.
     */
    private static takeOver(resolved: string, file: string, directory: string, cause: unknown): DirectoryLock {
        try {
            fs.unlinkSync(file);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw new DatabaseLockedError(directory, error);
            }
        }

        try {
            return DirectoryLock.create(resolved, file);
        } catch {
            throw new DatabaseLockedError(directory, cause);
        }
    }

    /**
     * Who took the lock, or null when the file says nothing - which is the normal state of a
     * `LOCK` the game wrote, since it locks the file rather than writing to it.
     */
    private static readOwner(file: string): LockOwner | null {
        let contents: string;
        try {
            contents = fs.readFileSync(file, 'utf8').trim();
        } catch {
            return null;
        }

        const [pid, hostname = ''] = contents.split(/\s+/);
        const parsed = Number(pid);

        if (!pid || !Number.isInteger(parsed) || parsed <= 0) return null;

        return { pid: parsed, hostname };
    }

    /**
     * Whether the recorded process is still alive.
     *
     * Signal 0 performs the permission and existence checks without delivering anything: no throw
     * means it is running, `ESRCH` means it is gone, and `EPERM` means it is running under another
     * user - which still counts as running.
     *
     * A lock taken on a different machine, on shared storage, cannot be judged this way, so it is
     * treated as live: refusing to start is recoverable, and two servers writing one world is not.
     */
    private static isRunning({ pid, hostname }: LockOwner): boolean {
        if (hostname.length > 0 && hostname !== os.hostname()) return true;

        try {
            process.kill(pid, 0);
            return true;
        } catch (error) {
            return (error as NodeJS.ErrnoException).code === 'EPERM';
        }
    }

    public release(): void {
        if (this.descriptor === null) return;

        fs.closeSync(this.descriptor);
        this.descriptor = null;
        DirectoryLock.held.delete(this.directory);

        try {
            fs.unlinkSync(this.file);
        } catch {
            // Someone else cleaned it up. Not worth failing a close over.
        }
    }
}

export default DirectoryLock;
