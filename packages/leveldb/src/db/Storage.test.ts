import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppendFile, replaceFileAtomically, writeFileSynced } from './Storage';

describe('storage', () => {
    let directory: string;
    /** A file outside the database that a planted link points at. */
    let victim: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-leveldb-storage-'));
        victim = path.join(directory, 'outside');
        fs.writeFileSync(victim, 'keep');
    });
    afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

    /** Plants a symbolic link at `name` pointing at the victim. */
    const plant = (name: string): string => {
        const link = path.join(directory, name);
        fs.symlinkSync(victim, link);
        return link;
    };

    it('writes a new manifest beside a link planted at its name without touching the target', () => {
        const manifest = plant('MANIFEST-000002');

        writeFileSynced(manifest, Buffer.from('manifest'));

        expect(fs.readFileSync(victim, 'utf8')).toBe('keep');
        expect(fs.lstatSync(manifest).isSymbolicLink()).toBe(false);
        expect(fs.readFileSync(manifest, 'utf8')).toBe('manifest');
    });

    it('replaces a table a crash left behind under a reused number', () => {
        const table = path.join(directory, '000005.ldb');
        fs.writeFileSync(table, 'orphan from before the crash');

        writeFileSynced(table, Buffer.from('table'));

        expect(fs.readFileSync(table, 'utf8')).toBe('table');
    });

    it('updates CURRENT through a planted temporary without touching the target', () => {
        plant('CURRENT.dbtmp');
        const current = path.join(directory, 'CURRENT');

        replaceFileAtomically(current, Buffer.from('MANIFEST-000002\n'));

        expect(fs.readFileSync(victim, 'utf8')).toBe('keep');
        expect(fs.readFileSync(current, 'utf8')).toBe('MANIFEST-000002\n');
    });

    it('refuses to append to a log that is a symbolic link', () => {
        const log = plant('000003.log');

        expect(() => new AppendFile(log)).toThrow();
        expect(fs.readFileSync(victim, 'utf8')).toBe('keep');
    });

    it.skipIf(process.platform === 'win32')('refuses a FIFO at the log name without waiting for a reader', () => {
        const log = path.join(directory, '000003.log');
        execFileSync('mkfifo', [log]);

        // Without O_NONBLOCK this open would block the test until it timed out.
        expect(() => new AppendFile(log)).toThrow();
    });

    it('appends to an existing log, keeping what it holds', () => {
        const log = path.join(directory, '000003.log');
        fs.writeFileSync(log, 'abc');

        const file = new AppendFile(log);
        file.append(Buffer.from('def'));
        file.close();

        expect(file.length).toBe(6);
        expect(fs.readFileSync(log, 'utf8')).toBe('abcdef');
    });
});
