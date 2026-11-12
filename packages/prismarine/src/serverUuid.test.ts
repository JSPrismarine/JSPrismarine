import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadOrCreateServerUuid, SERVER_UUID_FILE } from './serverUuid';

const UUID_V4 = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;

describe('serverUuid', () => {
    let directory: string;
    const file = () => path.join(directory, SERVER_UUID_FILE);

    beforeEach(() => {
        directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-server-uuid-test-'));
        vi.stubEnv('JSP_DIR', directory);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        rmSync(directory, { recursive: true, force: true });
    });

    it('writes a version 4 UUID to its file in the data directory on first start', () => {
        const uuid = loadOrCreateServerUuid();

        expect(uuid).toMatch(UUID_V4);
        expect(readFileSync(file(), 'utf8')).toBe(`${uuid}\n`);
    });

    it('reads the same UUID back on a second start', () => {
        const first = loadOrCreateServerUuid();

        expect(loadOrCreateServerUuid()).toBe(first);
    });

    it('keeps a stored UUID of another version as the file spells it, around whitespace', () => {
        writeFileSync(file(), '  FBF8646C-652C-38C4-96FF-A29D86CB5943\r\n');

        expect(loadOrCreateServerUuid()).toBe('FBF8646C-652C-38C4-96FF-A29D86CB5943');
    });

    it.each([['not-a-uuid'], [''], ['{"server-uuid": "fbf8646c-652c-48c4-96ff-a29d86cb5943"}']])(
        'replaces a file holding something other than a UUID (%j) with a fresh one',
        (stored) => {
            writeFileSync(file(), stored);

            const uuid = loadOrCreateServerUuid();

            expect(uuid).toMatch(UUID_V4);
            expect(readFileSync(file(), 'utf8')).toBe(`${uuid}\n`);
            expect(loadOrCreateServerUuid()).toBe(uuid);
        }
    );

    it('reads a UUID from a read-only file', () => {
        const first = loadOrCreateServerUuid();
        chmodSync(file(), 0o444);

        expect(loadOrCreateServerUuid()).toBe(first);
    });

    // Root ignores file modes, so the write this test expects to be refused would succeed.
    it.skipIf(process.getuid?.() === 0)('has no UUID when the data directory refuses the file', () => {
        chmodSync(directory, 0o555);
        try {
            expect(loadOrCreateServerUuid()).toBeUndefined();
        } finally {
            chmodSync(directory, 0o755);
        }
    });

    it('takes another file to read and write', () => {
        const other = path.join(directory, 'elsewhere.txt');

        const uuid = loadOrCreateServerUuid(other);

        expect(readFileSync(other, 'utf8')).toBe(`${uuid}\n`);
    });
});
