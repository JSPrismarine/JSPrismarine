import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findCheckouts, shareCache } from './share-worktree-cache.ts';

let root: string;
let local: string;
let shared: string;

beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(tmpdir(), 'jsp-share-cache-')));
    local = path.join(root, 'worktree', 'node_modules', '.cache', 'jsprismarine');
    shared = path.join(root, 'primary', 'node_modules', '.cache', 'jsprismarine');
});

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
});

const write = (file: string, contents: string): void => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
};

describe('shareCache', () => {
    it('links a missing cache to the shared one, creating both', () => {
        expect(shareCache(local, shared)).toBe('linked');

        expect(fs.lstatSync(local).isSymbolicLink()).toBe(true);
        write(path.join(local, 'bds', 'v1', 'server.zip'), 'zip');
        expect(fs.readFileSync(path.join(shared, 'bds', 'v1', 'server.zip'), 'utf8')).toBe('zip');
    });

    it('moves the versions the shared cache lacks and drops the duplicates', () => {
        write(path.join(shared, 'bds', 'marker'), 'shared');
        write(path.join(local, 'bds', 'marker'), 'local');
        write(path.join(local, 'java', '26.3', 'server.jar'), 'jar');

        expect(shareCache(local, shared)).toBe('migrated');

        expect(fs.lstatSync(local).isSymbolicLink()).toBe(true);
        expect(fs.readFileSync(path.join(shared, 'bds', 'marker'), 'utf8')).toBe('shared');
        expect(fs.readFileSync(path.join(shared, 'java', '26.3', 'server.jar'), 'utf8')).toBe('jar');
    });

    it('leaves a cache that already links to the shared one as it is', () => {
        shareCache(local, shared);

        expect(shareCache(local, shared)).toBe('already-shared');
    });

    it('leaves a link to somewhere else alone', () => {
        const elsewhere = path.join(root, 'elsewhere');
        fs.mkdirSync(elsewhere);
        fs.mkdirSync(path.dirname(local), { recursive: true });
        fs.symlinkSync(elsewhere, local);

        expect(shareCache(local, shared)).toBe('kept');
        expect(fs.realpathSync(local)).toBe(elsewhere);
    });
});

describe('findCheckouts', () => {
    const git = (cwd: string, ...args: string[]): void => {
        execFileSync('git', args, { cwd, stdio: 'ignore' });
    };

    it('names the primary checkout from a linked worktree and nothing from the primary', () => {
        const primary = path.join(root, 'primary');
        const worktree = path.join(root, 'worktree');
        fs.mkdirSync(primary);
        git(primary, 'init', '--quiet');
        git(
            primary,
            '-c',
            'user.name=t',
            '-c',
            'user.email=t@t',
            '-c',
            'commit.gpgsign=false',
            'commit',
            '--quiet',
            '--allow-empty',
            '-m',
            'init'
        );
        git(primary, 'worktree', 'add', '--quiet', '--detach', worktree);

        expect(findCheckouts(worktree)).toEqual({ current: worktree, primary });
        expect(findCheckouts(primary)).toBeUndefined();
    });

    it('finds nothing outside a git repository', () => {
        expect(findCheckouts(root)).toBeUndefined();
    });
});
