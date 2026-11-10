import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { repoRoot } from './cinnabar.mts';

const c8Bin = path.join(path.dirname(createRequire(import.meta.url).resolve('c8/package.json')), 'bin', 'c8.js');

/** Heap cap for the report: well below the bytes of every coverage file together. */
const HEAP_CAP_MB = 128;
const FILES = 40;
const SOURCE_MAP_BYTES = 8 * 1024 * 1024;

describe('client e2e coverage report', () => {
    // A server's `v8.takeCoverage()` snapshot repeats its whole source map cache, so a full run
    // leaves about a hundred files of about 35 MB. c8's default report parses every file before
    // it merges any, and CI's runner ran out of its 4 GB heap after every scenario had passed.
    it('merges more coverage files than its heap could hold at once', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsp-e2e-coverage-'));
        try {
            const temp = path.join(dir, 'tmp');
            fs.mkdirSync(temp);
            const source = pathToFileURL(path.join(repoRoot, 'packages', 'e2e-fixture', 'src', 'Fixture.ts')).href;
            const snapshot = {
                result: [],
                'source-map-cache': {
                    [source]: { lineLengths: [1], data: { version: 3, mappings: 'A'.repeat(SOURCE_MAP_BYTES) } }
                }
            };
            const first = path.join(temp, 'coverage-1-0-0.json');
            fs.writeFileSync(first, JSON.stringify(snapshot));
            for (let index = 1; index < FILES; index += 1) {
                fs.linkSync(first, path.join(temp, `coverage-1-${index}-0.json`));
            }

            const report = spawnSync(
                process.execPath,
                [
                    `--max-old-space-size=${HEAP_CAP_MB}`,
                    c8Bin,
                    'report',
                    '--temp-directory',
                    temp,
                    '--reports-dir',
                    path.join(dir, 'report'),
                    '--reporter',
                    'text-summary'
                ],
                // The repository's `.c8rc.json` is found from here, as `pnpm run e2e:client` finds it.
                { cwd: repoRoot, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } }
            );

            expect(FILES * SOURCE_MAP_BYTES).toBeGreaterThan(2 * HEAP_CAP_MB * 1024 * 1024);
            expect(report.stderr).not.toContain('heap out of memory');
            expect(report.status).toBe(0);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
