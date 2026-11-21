import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readResultsFiles, resultsDirName } from './resultsFiles.mts';

describe('resultsDirName', () => {
    it('gives two runs on one day different directories, in the order they started', () => {
        const morning = resultsDirName(new Date('2026-11-21T03:15:00.123Z'));
        const evening = resultsDirName(new Date('2026-11-21T19:02:09.000Z'));
        expect(morning).not.toBe(evening);
        expect(morning.startsWith('2026-11-21')).toBe(true);
        expect(morning.localeCompare(evening)).toBeLessThan(0);
        expect(morning).not.toContain(':');
    });
});

describe('readResultsFiles', () => {
    let dir: string | undefined;
    afterEach(() => {
        if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
        dir = undefined;
    });

    const write = (entry: string, startedAt: string) => {
        dir ??= mkdtempSync(path.join(tmpdir(), 'jsp-results-'));
        mkdirSync(path.join(dir, entry));
        writeFileSync(path.join(dir, entry, 'results.json'), JSON.stringify({ startedAt }));
        return dir;
    };
    const startTimes = (benchmarks: string) =>
        readResultsFiles(benchmarks).map(({ results }) => (results as { startedAt: string }).startedAt);

    it('keeps every run of a day, oldest first, next to a file in the date-only layout', () => {
        const late = '2026-11-21T22:00:00.000Z';
        const evening = '2026-11-22T19:00:00.000Z';
        const morning = '2026-11-22T03:00:00.000Z';
        write('2026-11-21', late);
        write(resultsDirName(new Date(evening)), evening);
        const benchmarks = write(resultsDirName(new Date(morning)), morning);
        expect(startTimes(benchmarks)).toEqual([late, morning, evening]);
    });

    it('orders by when each run started, not by directory name', () => {
        // A date-only directory sorts before a timed one of the same day, whatever the times.
        write('2026-11-21', '2026-11-21T22:00:00.000Z');
        const benchmarks = write(resultsDirName(new Date('2026-11-21T03:00:00.000Z')), '2026-11-21T03:00:00.000Z');
        expect(startTimes(benchmarks).at(-1)).toBe('2026-11-21T22:00:00.000Z');
    });

    it('reads nothing from a missing directory or one without results files', () => {
        expect(readResultsFiles(path.join(tmpdir(), 'jsp-results-missing'))).toEqual([]);
        dir = mkdtempSync(path.join(tmpdir(), 'jsp-results-'));
        mkdirSync(path.join(dir, 'notes'));
        expect(readResultsFiles(dir)).toEqual([]);
    });
});
