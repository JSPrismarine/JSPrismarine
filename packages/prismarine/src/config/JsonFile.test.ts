import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import pkg from '../../package.json' with { type: 'json' };
import { ConfigSyntaxError, parseConfigDocument } from './ConfigDocument';
import { readJsonFile, removeListEntries, upsertListEntry, writeJsonFile } from './JsonFile';

const hasName = (name: string) => (entry: unknown) =>
    typeof entry === 'object' && entry !== null && 'name' in entry && entry.name === name;

const LIST = [
    '[',
    '    // Griefed spawn twice.',
    '    { "name": "alice", "reason": "griefing" },',
    '    { "name": "bob", "reason": "" }',
    ']',
    ''
].join('\n');

describe('config', () => {
    describe('JsonFile', () => {
        let directory: string;

        beforeEach(() => {
            directory = mkdtempSync(path.join(tmpdir(), 'jsprismarine-json-file-'));
        });

        afterEach(() => {
            rmSync(directory, { recursive: true, force: true });
        });

        it('reads a missing file as the empty value it is told', async () => {
            const list = await readJsonFile(path.join(directory, 'missing.json'), '[]');
            const record = await readJsonFile(path.join(directory, 'missing.json'), '{}');

            expect(list.get([])).toStrictEqual([]);
            expect(record.get([])).toStrictEqual({});
        });

        it('reads a blank file as the empty value too', async () => {
            const file = path.join(directory, 'blank.json');
            writeFileSync(file, '\n');

            expect((await readJsonFile(file, '[]')).get([])).toStrictEqual([]);
        });

        it('refuses a file that does not parse', async () => {
            const file = path.join(directory, 'broken.json');
            writeFileSync(file, '[{ "name": ');

            await expect(readJsonFile(file, '[]')).rejects.toBeInstanceOf(ConfigSyntaxError);
        });

        it('round-trips a file through read and write with its comments', async () => {
            const file = path.join(directory, 'list.json');
            writeFileSync(file, LIST);

            const document = await readJsonFile(file, '[]');
            await writeJsonFile(file, document);

            expect(readFileSync(file, 'utf8')).toBe(LIST);
        });

        it.each([
            { file: 'config.json', empty: '{}' as const, schema: 'config.schema.json' },
            { file: 'permissions.json', empty: '{}' as const, schema: 'permissions.schema.json' },
            { file: 'ops.json', empty: '[]' as const, schema: 'ops.schema.json' },
            { file: 'banned-players.json', empty: '[]' as const, schema: 'banned-players.schema.json' },
            { file: 'worlds/main/level.json', empty: '{}' as const, schema: 'level.schema.json' },
            {
                file: 'worlds/main/playerdata/123.json',
                empty: '{}' as const,
                schema: 'player-data.schema.json'
            }
        ])('writes the versioned $schema reference for $file', async ({ file: relativeFile, empty, schema }) => {
            const file = path.join(directory, relativeFile);
            mkdirSync(path.dirname(file), { recursive: true });

            await writeJsonFile(file, await readJsonFile(file, empty));
            const document = await readJsonFile(file, empty);
            await writeJsonFile(file, document);

            const text = readFileSync(file, 'utf8');
            const schemaUrl = `https://unpkg.com/@jsprismarine/prismarine@${pkg.version}/schemas/${schema}`;
            expect(text.split(schemaUrl)).toHaveLength(2);
            if (empty === '[]') {
                expect(text).toContain(`// JSPrismarine schema: ${schemaUrl}`);
            } else {
                expect(document.get(['$schema'])).toBe(schemaUrl);
            }
        });

        it('replaces a matching entry in place and appends a new one with its comment', () => {
            const document = parseConfigDocument('json', LIST);

            upsertListEntry(document, hasName('bob'), { name: 'bob', reason: 'spam' });
            upsertListEntry(document, hasName('carol'), { name: 'carol', reason: 'alts' }, 'Added by /ban.');

            const text = document.toString();
            expect(document.get([])).toStrictEqual([
                { name: 'alice', reason: 'griefing' },
                { name: 'bob', reason: 'spam' },
                { name: 'carol', reason: 'alts' }
            ]);
            expect(text).toContain('// Griefed spawn twice.');
            expect(text).toContain('// Added by /ban.');
        });

        it('appends to an empty list', () => {
            const document = parseConfigDocument('json', '[]');
            upsertListEntry(document, hasName('alice'), { name: 'alice' });

            expect(document.get([])).toStrictEqual([{ name: 'alice' }]);
        });

        it('removes every matching entry and keeps the comments of the others', () => {
            const document = parseConfigDocument('json', LIST);

            expect(removeListEntries(document, hasName('bob'))).toBe(true);
            expect(removeListEntries(document, hasName('bob'))).toBe(false);

            expect(document.get([])).toStrictEqual([{ name: 'alice', reason: 'griefing' }]);
            expect(document.toString()).toContain('// Griefed spawn twice.');
        });
    });
});
