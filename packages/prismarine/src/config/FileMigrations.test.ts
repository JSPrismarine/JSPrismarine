import {
    existsSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    utimesSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isJSPrismarineError } from '@jsprismarine/errors/JSPrismarineError';
import { PrismarineServerErrors } from '@jsprismarine/errors/prismarine/server';

import { parseConfigDocument } from './ConfigDocument';
import type { FileMigrations, MigrationLogger } from './FileMigrations';
import { backupPathOf, migrateDocument, migrateFile } from './FileMigrations';

/** A file at version 3 whose steps record the order they ran in, each adding one key. */
const recordingMigrations = (ran: number[], overrides: Partial<FileMigrations> = {}): FileMigrations => ({
    fileName: 'example.json',
    unversioned: 0,
    current: 3,
    steps: [1, 2, 3].map((to) => ({
        to,
        migrate: (document) => {
            ran.push(to);
            document.set([`added-by-${to}`], true);
            return undefined;
        }
    })),
    ...overrides
});

/** What a test logger heard. */
const recordingLogger = (): MigrationLogger & { readonly lines: string[] } => {
    const lines: string[] = [];
    return { lines, info: (message: string) => void lines.push(message) };
};

/** The code of what `run` throws, or undefined when it returns. */
const codeThrownBy = async (run: () => unknown): Promise<string | undefined> => {
    try {
        await run();
    } catch (error: unknown) {
        return isJSPrismarineError(error) ? error.code : 'not a catalog error';
    }
    return undefined;
};

describe('FileMigrations', () => {
    describe('migrateDocument', () => {
        it.each([
            { from: 0, steps: [1, 2, 3] },
            { from: 1, steps: [2, 3] },
            { from: 2, steps: [3] },
            { from: 3, steps: [] }
        ])('runs the steps after version $from, in order, and ends at the current version', ({ from, steps }) => {
            const ran: number[] = [];
            const document = parseConfigDocument(from === 0 ? '{}' : `{ "schemaVersion": ${from} }`);

            const migrated = migrateDocument(recordingMigrations(ran), document);

            expect(ran).toEqual(steps);
            expect([migrated.from, migrated.to]).toEqual([from, 3]);
            expect(migrated.document.get(['schemaVersion'])).toBe(3);
            for (const step of [1, 2, 3]) {
                expect(migrated.document.has([`added-by-${step}`])).toBe(steps.includes(step));
            }
        });

        it('reads a file without a version as the unversioned version, whatever that is', () => {
            const ran: number[] = [];

            const migrated = migrateDocument(
                recordingMigrations(ran, { unversioned: 1, steps: [], current: 1 }),
                parseConfigDocument('{ "other": 1 }')
            );

            expect(ran).toEqual([]);
            expect(migrated.from).toBe(1);
        });

        it('keeps the version in the key the definition names', () => {
            const migrated = migrateDocument(
                recordingMigrations([], { versionKey: 'formatVersion' }),
                parseConfigDocument('{ "formatVersion": 2 }')
            );

            expect(migrated.document.get(['formatVersion'])).toBe(3);
            expect(migrated.document.has(['schemaVersion'])).toBe(false);
        });

        it('lets a step replace the document, and runs the next step on the replacement', () => {
            const replaced: FileMigrations = {
                fileName: 'example.json',
                unversioned: 0,
                current: 2,
                steps: [
                    { to: 1, migrate: () => parseConfigDocument('{ "fresh": true }') },
                    {
                        to: 2,
                        migrate: (document) => {
                            document.set(['saw-fresh'], document.get(['fresh']));
                            return undefined;
                        }
                    }
                ]
            };

            const { document } = migrateDocument(replaced, parseConfigDocument('{ "old": true }'));

            expect(document.get([])).toEqual({ fresh: true, 'saw-fresh': true, schemaVersion: 2 });
        });

        it('refuses a file newer than the server knows', async () => {
            const ran: number[] = [];

            expect(
                await codeThrownBy(() =>
                    migrateDocument(recordingMigrations(ran), parseConfigDocument('{ "schemaVersion": 4 }'))
                )
            ).toBe('PRISMARINE_FILE_VERSION_TOO_NEW');
            expect(ran).toEqual([]);
        });

        it.each(['"2"', '1.5', '-1', 'null'])('refuses a version of %s', async (version) => {
            expect(
                await codeThrownBy(() =>
                    migrateDocument(recordingMigrations([]), parseConfigDocument(`{ "schemaVersion": ${version} }`))
                )
            ).toBe('PRISMARINE_FILE_VERSION_INVALID');
        });

        it('refuses a file older than the unversioned version', async () => {
            expect(
                await codeThrownBy(() =>
                    migrateDocument(
                        recordingMigrations([], {
                            unversioned: 1,
                            current: 4,
                            steps: [2, 3, 4].map((to) => ({ to, migrate: () => undefined }))
                        }),
                        parseConfigDocument('{ "schemaVersion": 0 }')
                    )
                )
            ).toBe('PRISMARINE_FILE_VERSION_INVALID');
        });

        it('refuses a file whose root is a list', async () => {
            expect(await codeThrownBy(() => migrateDocument(recordingMigrations([]), parseConfigDocument('[]')))).toBe(
                'PRISMARINE_VERSIONED_FILE_NOT_OBJECT'
            );
        });

        it.each([
            { name: 'a gap', tos: [1, 3], current: 3 },
            { name: 'a repeat', tos: [1, 1, 2], current: 3 },
            { name: 'a missing last step', tos: [1, 2], current: 3 },
            { name: 'a step past current', tos: [1, 2, 3], current: 2 }
        ])('refuses a definition with $name', async ({ tos, current }) => {
            const broken = recordingMigrations([], {
                current,
                steps: tos.map((to) => ({ to, migrate: () => undefined }))
            });

            expect(await codeThrownBy(() => migrateDocument(broken, parseConfigDocument('{}')))).toBe(
                'PRISMARINE_FILE_MIGRATIONS_MISDECLARED'
            );
        });
    });

    describe('migrateFile', () => {
        let directory: string;
        let file: string;
        let logger: ReturnType<typeof recordingLogger>;

        beforeEach(() => {
            directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-file-migrations-'));
            // A name with no schema reference, so the written text is exactly the document's.
            file = path.join(directory, 'example.json');
            logger = recordingLogger();
        });

        afterEach(() => {
            rmSync(directory, { recursive: true, force: true });
        });

        const ORIGINAL = '{\n    // Kept by hand.\n    "name": "kept"\n}\n';

        it('upgrades an unversioned file through every step, keeping its comments, and logs one line', async () => {
            const ran: number[] = [];
            writeFileSync(file, ORIGINAL);

            const migrated = await migrateFile(file, recordingMigrations(ran), logger);

            expect(ran).toEqual([1, 2, 3]);
            const text = readFileSync(file, 'utf8');
            expect(migrated?.text).toBe(text);
            expect(text).toContain('// Kept by hand.');
            expect(parseConfigDocument(text).get([])).toEqual({
                name: 'kept',
                'added-by-1': true,
                'added-by-2': true,
                'added-by-3': true,
                schemaVersion: 3
            });
            expect(logger.lines).toHaveLength(1);
        });

        it('keeps the original byte for byte beside the file, named after its version', async () => {
            writeFileSync(file, '{ "schemaVersion": 1, "name": "kept" }');

            const migrated = await migrateFile(file, recordingMigrations([]), logger);

            expect(migrated?.backup).toBe(backupPathOf(file, 1));
            expect(readFileSync(backupPathOf(file, 1), 'utf8')).toBe('{ "schemaVersion": 1, "name": "kept" }');
        });

        it('never overwrites an earlier backup of the same version', async () => {
            writeFileSync(backupPathOf(file, 0), 'an older original');
            writeFileSync(file, ORIGINAL);

            const migrated = await migrateFile(file, recordingMigrations([]), logger);

            expect(readFileSync(backupPathOf(file, 0), 'utf8')).toBe('an older original');
            expect(migrated?.backup).toBe(backupPathOf(file, 0, 2));
            expect(readFileSync(backupPathOf(file, 0, 2), 'utf8')).toBe(ORIGINAL);
        });

        it('does not rewrite a file at the current version, back it up or log', async () => {
            const ran: number[] = [];
            const text = '{ "schemaVersion": 3, "name": "kept" }';
            writeFileSync(file, text);
            const past = new Date('2020-01-01T00:00:00Z');
            utimesSync(file, past, past);

            const migrated = await migrateFile(file, recordingMigrations(ran), logger);

            expect(ran).toEqual([]);
            expect(migrated?.text).toBe(text);
            expect(statSync(file).mtimeMs).toBe(past.getTime());
            expect(readdirSync(directory)).toEqual(['example.json']);
            expect(logger.lines).toEqual([]);
        });

        it('is idempotent: a second load of a migrated file changes nothing', async () => {
            writeFileSync(file, ORIGINAL);
            await migrateFile(file, recordingMigrations([]), logger);
            const once = readFileSync(file, 'utf8');
            const ran: number[] = [];

            await migrateFile(file, recordingMigrations(ran), logger);

            expect(ran).toEqual([]);
            expect(readFileSync(file, 'utf8')).toBe(once);
            expect(readdirSync(directory).sort()).toEqual(['example.json', 'example.json.v0.bak']);
        });

        it('leaves the file untouched and writes no backup when a step throws', async () => {
            writeFileSync(file, ORIGINAL);
            const failing = recordingMigrations([], {
                steps: [
                    { to: 1, migrate: () => undefined },
                    {
                        to: 2,
                        migrate: () => {
                            throw new PrismarineServerErrors.PortAndServerPortBothSet({ configFilePath: file });
                        }
                    },
                    { to: 3, migrate: () => undefined }
                ]
            });

            await expect(migrateFile(file, failing, logger)).rejects.toBeInstanceOf(
                PrismarineServerErrors.PortAndServerPortBothSet
            );

            expect(readFileSync(file, 'utf8')).toBe(ORIGINAL);
            expect(readdirSync(directory)).toEqual(['example.json']);
            expect(logger.lines).toEqual([]);
        });

        it('refuses a newer file without touching it', async () => {
            writeFileSync(file, '{ "schemaVersion": 9 }');

            expect(await codeThrownBy(() => migrateFile(file, recordingMigrations([]), logger))).toBe(
                'PRISMARINE_FILE_VERSION_TOO_NEW'
            );

            expect(readFileSync(file, 'utf8')).toBe('{ "schemaVersion": 9 }');
            expect(readdirSync(directory)).toEqual(['example.json']);
        });

        it('answers undefined for a missing file and creates nothing', async () => {
            expect(await migrateFile(file, recordingMigrations([]), logger)).toBeUndefined();
            expect(existsSync(file)).toBe(false);
        });

        it('reads a blank file as an unversioned one', async () => {
            const ran: number[] = [];
            writeFileSync(file, '  \n');

            const migrated = await migrateFile(file, recordingMigrations(ran), logger);

            expect(ran).toEqual([1, 2, 3]);
            expect(migrated?.from).toBe(0);
        });
    });
});
