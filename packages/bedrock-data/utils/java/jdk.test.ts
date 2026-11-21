import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findJdkHome, jdkBinaryPath, pathJavaHome } from './jdk.ts';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'jsp-jdk-'));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

describe('jdkBinaryPath', () => {
    it('adds the Windows executable extension only when needed', () => {
        expect(jdkBinaryPath(root, 'java', 'win32')).toBe(join(root, 'bin', 'java.exe'));
        expect(jdkBinaryPath(root, 'java.exe', 'win32')).toBe(join(root, 'bin', 'java.exe'));
    });

    it('leaves executable names unchanged on Unix', () => {
        expect(jdkBinaryPath(root, 'java', 'linux')).toBe(join(root, 'bin', 'java'));
    });
});

// Each search gets its own environment, platform and version probe. Test files share one process
// and its module cache, so a test that set `process.env` or `process.platform`, or mocked
// `node:child_process`, changed them for the files running beside or after it (issue #3491).
describe('findJdkHome', () => {
    it('checks Windows executable names before accepting a JDK', async () => {
        const home = join(root, 'jdk');
        const bin = join(home, 'bin');
        await mkdir(bin, { recursive: true });
        await writeFile(join(bin, 'java.exe'), '');
        await writeFile(join(bin, 'javac.exe'), '');
        const ran: string[] = [];
        const versionOf = (javaBinary: string): string => {
            ran.push(javaBinary);
            return 'openjdk 25 2026-01-01';
        };

        expect(
            findJdkHome(
                { minimumMajor: 25, binaries: ['java', 'javac'] },
                { env: { PATH: '', JAVA_HOME: home }, platform: 'win32', versionOf }
            )
        ).toBe(home);
        expect(ran).toEqual([join(bin, 'java.exe')]);
    });
});

describe('pathJavaHome', () => {
    const putJavaIn = async (home: string): Promise<void> => {
        const bin = join(home, 'bin');
        await mkdir(bin, { recursive: true });
        await writeFile(join(bin, process.platform === 'win32' ? 'java.exe' : 'java'), '');
    };

    it('finds the home of the java on PATH', async () => {
        await putJavaIn(join(root, 'jdk'));

        // The lookup resolves symlinks, and macOS serves `/var/folders` temp paths through one.
        expect(pathJavaHome({ env: { PATH: join(root, 'jdk', 'bin') } })).toBe(join(realpathSync(root), 'jdk'));
    });

    it('takes the first java on PATH, as the shell would', async () => {
        await putJavaIn(join(root, 'first'));
        await putJavaIn(join(root, 'second'));
        const path = [join(root, 'first', 'bin'), join(root, 'second', 'bin')].join(
            process.platform === 'win32' ? ';' : ':'
        );

        expect(pathJavaHome({ env: { PATH: path } })).toBe(join(realpathSync(root), 'first'));
    });

    it('returns nothing when PATH holds no java', () => {
        expect(pathJavaHome({ env: { PATH: join(root, 'empty') } })).toBeUndefined();
    });

    it('returns nothing when PATH is empty', () => {
        expect(pathJavaHome({ env: { PATH: '' } })).toBeUndefined();
    });
});
