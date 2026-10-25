import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { assertComplete, collectDumpTables, DUMP_PREFIX, parseDumpLine } from './protocol.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** A content log line as the engine decorates it. */
const logged = (body: string) => `[2026-10-25 09:14:02:113 INFO] [Scripting] ${body}`;

describe('parseDumpLine', () => {
    it('reads a row out of a decorated content log line', () => {
        expect(parseDumpLine(logged('DUMP items {"id":"minecraft:stone"}'))).toEqual({
            table: 'items',
            value: { id: 'minecraft:stone' }
        });
    });

    it('ignores a line that is not a dump line', () => {
        expect(parseDumpLine('[INFO] Server started.')).toBeUndefined();
    });

    it('ignores a dump line whose body is not JSON', () => {
        expect(parseDumpLine(logged('DUMP items {oh no'))).toBeUndefined();
    });

    it('ignores a dump line with no row after the table name', () => {
        expect(parseDumpLine(logged('DUMP items'))).toBeUndefined();
    });
});

describe('collectDumpTables', () => {
    const lines = [
        '[INFO] Starting Server',
        logged('DUMP begin {"blockTypes":2}'),
        logged('DUMP block-types {"id":"minecraft:stone"}'),
        logged('DUMP block-types {"id":"minecraft:dirt"}'),
        logged('DUMP errors {"table":"items","id":"minecraft:air"}'),
        logged('DUMP end {"rows":3,"errors":1}'),
        '[INFO] Server stop requested.'
    ];

    it('groups rows by table and keeps the begin and end rows apart', () => {
        const dumped = collectDumpTables(lines);
        expect([...dumped.tables.keys()].sort()).toEqual(['block-types', 'errors']);
        expect(dumped.tables.get('block-types')).toHaveLength(2);
        expect(dumped.begin).toEqual({ blockTypes: 2 });
        expect(dumped.end).toEqual({ rows: 3, errors: 1 });
    });

    it('accepts a run that wrote the number of rows it says it did', () => {
        expect(assertComplete(collectDumpTables(lines))).toEqual({ rows: 3, errors: 1 });
    });

    it('refuses a run the watchdog cut short before the end row', () => {
        expect(() => assertComplete(collectDumpTables(lines.slice(0, -2)))).toThrow(/never logged its `end` row/);
    });

    it('refuses a run whose rows did not all reach the log', () => {
        const short = lines.filter((line) => !line.includes('minecraft:dirt'));
        expect(() => assertComplete(collectDumpTables(short))).toThrow(/says it wrote 3 rows, but 2/);
    });
});

describe('the pack scripts', () => {
    // The scripts run inside the engine and cannot import from the repository, so they repeat
    // the prefix as a literal. This is what keeps the copy honest.
    it.each(['dump.js', 'refworld.js'])('%s writes the prefix this module parses', async (script) => {
        const source = await readFile(join(here, 'pack', 'scripts', script), 'utf8');
        expect(source).toContain(`const PREFIX = '${DUMP_PREFIX}'`);
    });
});
