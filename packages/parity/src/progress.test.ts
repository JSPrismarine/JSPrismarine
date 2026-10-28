import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { FAMILIES } from './families.ts';
import { reportParityProgress } from './progress.ts';

describe('parity progress reporting', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('emits a GitHub Actions warning annotation', () => {
        vi.stubEnv('GITHUB_ACTIONS', 'true');
        vi.stubEnv('PARITY_PROGRESS_FILE', '');
        const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

        reportParityProgress(FAMILIES.itemsComponents, { javaComponentTypes: 8 });

        expect(write).toHaveBeenCalledWith('::warning title=Parity progress::items.components javaComponentTypes: 8\n');
    });

    it('uses console.warn outside GitHub Actions', () => {
        vi.stubEnv('GITHUB_ACTIONS', '');
        vi.stubEnv('PARITY_PROGRESS_FILE', '');
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        reportParityProgress(FAMILIES.itemsComponents, { javaComponentTypes: 8 });

        expect(warn).toHaveBeenCalledWith('[parity progress] items.components javaComponentTypes: 8');
    });

    it('writes structured measurements for the dashboard to compare across runs', () => {
        const directory = mkdtempSync(join(tmpdir(), 'parity-progress-'));
        const outputPath = join(directory, 'measurements.jsonl');
        vi.stubEnv('PARITY_PROGRESS_FILE', outputPath);

        try {
            reportParityProgress(FAMILIES.itemsComponents, { javaComponentTypes: 8, comparedItems: 32 });

            expect(readFileSync(outputPath, 'utf8').trim().split('\n')).toEqual([
                JSON.stringify({ family: FAMILIES.itemsComponents, name: 'javaComponentTypes', value: 8 }),
                JSON.stringify({ family: FAMILIES.itemsComponents, name: 'comparedItems', value: 32 })
            ]);
        } finally {
            rmSync(directory, { recursive: true, force: true });
        }
    });
});
