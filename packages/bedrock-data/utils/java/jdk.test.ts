import * as childProcess from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { findJdkHome, jdkBinaryPath, pathJavaHome } from './jdk.ts';

vi.mock('node:child_process', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:child_process')>();
    return { ...actual, execFileSync: vi.fn() };
});

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'jsp-jdk-'));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    vi.mocked(childProcess.execFileSync).mockReset();
});

const withPlatform = <T>(platform: typeof process.platform, action: () => T): T => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    if (originalPlatform === undefined) throw new Error('process.platform is not configurable');

    Object.defineProperty(process, 'platform', { ...originalPlatform, value: platform });
    try {
        return action();
    } finally {
        Object.defineProperty(process, 'platform', originalPlatform);
    }
};

describe('jdkBinaryPath', () => {
    it('adds the Windows executable extension only when needed', () => {
        withPlatform('win32', () => {
            expect(jdkBinaryPath(root, 'java')).toBe(join(root, 'bin', 'java.exe'));
            expect(jdkBinaryPath(root, 'java.exe')).toBe(join(root, 'bin', 'java.exe'));
        });
    });

    it('leaves executable names unchanged on Unix', () => {
        withPlatform('linux', () => {
            expect(jdkBinaryPath(root, 'java')).toBe(join(root, 'bin', 'java'));
        });
    });
});

describe('findJdkHome', () => {
    it('checks Windows executable names before accepting a JDK', async () => {
        const home = join(root, 'jdk');
        const bin = join(home, 'bin');
        await mkdir(bin, { recursive: true });
        await writeFile(join(bin, 'java.exe'), '');
        await writeFile(join(bin, 'javac.exe'), '');

        const originalEnv = {
            path: process.env['PATH'],
            javaHome: process.env['JAVA_HOME'],
            preferredHome: process.env['JSP_JAVA_HOME']
        };
        process.env['PATH'] = '';
        process.env['JAVA_HOME'] = home;
        delete process.env['JSP_JAVA_HOME'];
        vi.mocked(childProcess.execFileSync).mockReturnValue('openjdk 25 2026-01-01');

        try {
            withPlatform('win32', () => {
                expect(findJdkHome({ minimumMajor: 25, binaries: ['java', 'javac'] })).toBe(home);
            });
            expect(childProcess.execFileSync).toHaveBeenCalledWith(join(bin, 'java.exe'), ['--version'], {
                encoding: 'utf8'
            });
        } finally {
            for (const [key, value] of [
                ['PATH', originalEnv.path],
                ['JAVA_HOME', originalEnv.javaHome],
                ['JSP_JAVA_HOME', originalEnv.preferredHome]
            ]) {
                if (value === undefined) delete process.env[key];
                else process.env[key] = value;
            }
        }
    });
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
        expect(pathJavaHome()).toBe(join(realpathSync(root), 'jdk'));
    });

    it('takes the first java on PATH, as the shell would', async () => {
        await putJavaIn(join(root, 'first'));
        await putJavaIn(join(root, 'second'));
        process.env['PATH'] = [join(root, 'first', 'bin'), join(root, 'second', 'bin')].join(
            process.platform === 'win32' ? ';' : ':'
        );

        expect(pathJavaHome()).toBe(join(realpathSync(root), 'first'));
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
