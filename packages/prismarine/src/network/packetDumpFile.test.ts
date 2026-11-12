import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ensurePrivateDirectory, writePacketDump } from './packetDumpFile';

const posix = process.getuid !== undefined;

describe('packet dump files', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-dump-file-test-'));
    });
    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('creates a missing directory that only this user can use, and a new file in it', () => {
        const directory = path.join(root, 'dumps');

        const file = writePacketDump(directory, 'stem', Buffer.from([1, 2, 3]));

        expect(path.dirname(file)).toBe(directory);
        expect(path.basename(file)).toMatch(/^stem-[0-9a-f]{8}\.bin$/);
        expect(fs.readFileSync(file)).toEqual(Buffer.from([1, 2, 3]));
        if (posix) {
            expect(fs.statSync(directory).mode & 0o077).toBe(0);
            expect(fs.statSync(file).mode & 0o077).toBe(0);
        }
    });

    it('gives two dumps of the same stem two files', () => {
        const first = writePacketDump(root, 'same', Buffer.from([1]));
        const second = writePacketDump(root, 'same', Buffer.from([2]));

        expect(first).not.toBe(second);
        expect(fs.readFileSync(first)).toEqual(Buffer.from([1]));
    });

    it.skipIf(!posix)('refuses a dump directory that is a symbolic link', () => {
        const target = path.join(root, 'elsewhere');
        fs.mkdirSync(target, { mode: 0o700 });
        const link = path.join(root, 'dumps');
        fs.symlinkSync(target, link);

        expect(() => writePacketDump(link, 'stem', Buffer.from([1]))).toThrow(/symbolic link/);
        expect(fs.readdirSync(target)).toEqual([]);
    });

    it.skipIf(!posix)('refuses a dump directory other users can write to', () => {
        const shared = path.join(root, 'shared');
        fs.mkdirSync(shared);
        fs.chmodSync(shared, 0o777);

        expect(() => ensurePrivateDirectory(shared)).toThrow(/other users/);
    });

    it.skipIf(!posix)('never writes through a symbolic link planted at the file name', () => {
        // Even a link that guessed the random suffix is refused rather than followed.
        const victim = path.join(root, 'victim');
        fs.writeFileSync(victim, 'keep');
        const directory = path.join(root, 'dumps');
        fs.mkdirSync(directory, { mode: 0o700 });
        const real = fs.writeFileSync;
        let planted = false;
        fs.writeFileSync = ((file: fs.PathOrFileDescriptor, ...rest: never[]) => {
            if (!planted && typeof file === 'string') {
                planted = true;
                fs.symlinkSync(victim, file);
            }
            return Reflect.apply(real, fs, [file, ...rest]);
        }) as typeof fs.writeFileSync;
        try {
            expect(() => writePacketDump(directory, 'stem', Buffer.from('owned'))).toThrow(/EEXIST/);
        } finally {
            fs.writeFileSync = real;
        }

        expect(fs.readFileSync(victim, 'utf8')).toBe('keep');
    });
});
