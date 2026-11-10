/**
 * Points a linked git worktree's download cache at the primary checkout's.
 *
 * Every fetcher and generator in the repository reads and writes
 * `<checkout>/node_modules/.cache/jsprismarine`: the CloudburstMC data, the Bedrock Dedicated
 * Server, `bedrock-samples`, the Java server jar and the data generated from it. A worktree that
 * owns its own copy downloads and generates all of it again. This makes the worktree's directory
 * a symbolic link to the primary checkout's, so each pinned version is fetched once and every
 * worktree reads the same files. Paths stay as they were, so no reader needs to change.
 *
 * Runs first in the root `prepare` hook, before anything fills the cache. A worktree that already
 * has a cache moves the versions the shared one lacks across and drops its duplicates, which is
 * safe because every entry is a pinned, verified download or what was generated from one.
 *
 * Set `JSP_SHARED_CACHE=0` to keep a worktree's cache to itself.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Where the cache lives inside a checkout. */
const CACHE_PATH = path.join('node_modules', '.cache', 'jsprismarine');

/** What {@link shareCache} did. */
export type ShareOutcome =
    /** The local cache did not exist and is now a link to the shared one. */
    | 'linked'
    /** The local cache was a directory; its entries were merged and it is now a link. */
    | 'migrated'
    /** The local cache already links to the shared one. */
    | 'already-shared'
    /** The local cache is something else, such as a link elsewhere, and was left alone. */
    | 'kept'
    /** The two caches are on different file systems, so moving entries would copy them. */
    | 'separate-devices';

/** The checkout this command runs in and the repository's primary checkout. */
export interface Checkouts {
    current: string;
    primary: string;
}

const git = (cwd: string, args: string[]): string =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/**
 * The current checkout and the primary one, read from `git worktree list`, whose first entry is
 * always the main worktree.
 *
 * @param cwd - A directory inside the checkout.
 * @returns Both checkouts, or `undefined` outside git, in the primary checkout itself, or when
 *   the repository is bare and so has no primary checkout to hold a cache.
 */
export const findCheckouts = (cwd: string): Checkouts | undefined => {
    let current: string;
    let listing: string;
    try {
        current = git(cwd, ['rev-parse', '--show-toplevel']);
        listing = git(cwd, ['worktree', 'list', '--porcelain']);
    } catch {
        return undefined;
    }

    const [first = ''] = listing.split(/\n\n/);
    const lines = first.split('\n');
    if (lines.includes('bare')) return undefined;
    const primary = lines.find((line) => line.startsWith('worktree '))?.slice('worktree '.length);
    if (primary === undefined) return undefined;
    if (fs.realpathSync(primary) === fs.realpathSync(current)) return undefined;
    return { current, primary };
};

/**
 * Makes `local` a link to `shared`, creating `shared` when it does not exist yet.
 *
 * @param local - The worktree's cache directory.
 * @param shared - The primary checkout's cache directory.
 * @returns What was done; see {@link ShareOutcome}.
 */
export const shareCache = (local: string, shared: string): ShareOutcome => {
    fs.mkdirSync(shared, { recursive: true });
    fs.mkdirSync(path.dirname(local), { recursive: true });

    const existing = fs.lstatSync(local, { throwIfNoEntry: false });
    if (existing === undefined) {
        // `junction` lets Windows link a directory without elevated rights; POSIX ignores it.
        fs.symlinkSync(shared, local, 'junction');
        return 'linked';
    }
    if (existing.isSymbolicLink()) {
        return fs.realpathSync(local) === fs.realpathSync(shared) ? 'already-shared' : 'kept';
    }
    if (!existing.isDirectory()) return 'kept';
    if (existing.dev !== fs.statSync(shared).dev) return 'separate-devices';

    for (const name of fs.readdirSync(local)) {
        const from = path.join(local, name);
        const to = path.join(shared, name);
        if (fs.existsSync(to)) fs.rmSync(from, { recursive: true, force: true });
        else fs.renameSync(from, to);
    }
    fs.rmdirSync(local);
    fs.symlinkSync(shared, local, 'junction');
    return 'migrated';
};

const main = (): void => {
    if (process.env.JSP_SHARED_CACHE === '0') return;
    const checkouts = findCheckouts(process.cwd());
    if (checkouts === undefined) return;

    const local = path.join(checkouts.current, CACHE_PATH);
    const shared = path.join(checkouts.primary, CACHE_PATH);
    // A cache this script cannot share is still a working cache, so nothing here fails an install.
    try {
        const outcome = shareCache(local, shared);
        if (outcome === 'linked' || outcome === 'migrated') {
            console.log(`Sharing the download cache with the primary checkout: ${shared}`);
        } else if (outcome === 'separate-devices') {
            console.warn(`Not sharing the download cache: ${shared} is on another file system.`);
        }
    } catch (error) {
        console.warn(`Not sharing the download cache: ${error instanceof Error ? error.message : String(error)}`);
    }
};

if (import.meta.main) main();
