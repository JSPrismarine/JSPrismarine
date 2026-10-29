import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { pathJavaHome } from './jdk.ts';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'jsp-jdk-'));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe('pathJavaHome', () => {
    const originalPath = process.env['PATH'];

    afterEach(() => {
        process.env['PATH'] = originalPath;
    });

    const putJavaIn = async (home: string): Promise<void> => {
        const bin = join(home, 'bin');
        await mkdir(bin, { recursive: true });
        await writeFile(join(bin, process.platform === 'win32' ? 'java.exe' : 'java'), '');
    };

    it('finds the home of the java on PATH', async () => {
        await putJavaIn(join(root, 'jdk'));
        process.env['PATH'] = join(root, 'jdk', 'bin');

        // The lookup resolves symlinks, and macOS serves `/var/folders` temp paths through one.
        expect(pathJavaHome()).toBe(join(await realpath(root), 'jdk'));
    });

    it('takes the first java on PATH, as the shell would', async () => {
        await putJavaIn(join(root, 'first'));
        await putJavaIn(join(root, 'second'));
        process.env['PATH'] = [join(root, 'first', 'bin'), join(root, 'second', 'bin')].join(
            process.platform === 'win32' ? ';' : ':'
        );

        expect(pathJavaHome()).toBe(join(await realpath(root), 'first'));
    });

    it('returns nothing when PATH holds no java', () => {
        process.env['PATH'] = join(root, 'empty');

        expect(pathJavaHome()).toBeUndefined();
    });

    it('returns nothing when PATH is empty', () => {
        process.env['PATH'] = '';

        expect(pathJavaHome()).toBeUndefined();
    });
});
