import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import type { Label } from './coderabbit-labels.mts';
import { syncCodeRabbitLabels, writeLabelManifest } from './coderabbit-labels.mts';

const dirs: string[] = [];
afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const CODERABBIT_CONFIG = `# Top comment stays.
reviews:
    suggested_labels: true
    labeling_instructions:
        - label: Stale
          instructions: Old text.
    # Comment after the generated block stays.
    mutually_exclusive_groups:
        status:
            - Blocked
    auto_apply_labels: true
    slop_detection:
        label: Slop
    poem: false
`;

const LABELS: Array<Label | Record<string, unknown>> = [
    { name: 'Bug', color: 'd73a4a', ai_apply_when: 'Fixes broken behavior.' },
    { name: 'Question', color: 'd876e3', description: 'More information is requested' },
    { name: 'Blocked', color: 'b60205', ai_apply_when: 'Only when explicitly blocked.' },
    { name: 'Slop', color: 'ff0000' }
];

/** Creates a repository holding a label catalog and a CodeRabbit config. */
function repo(labels = LABELS, config = CODERABBIT_CONFIG): string {
    const dir = mkdtempSync(join(tmpdir(), 'coderabbit-labels-'));
    dirs.push(dir);
    mkdirSync(join(dir, '.github'));
    writeFileSync(join(dir, '.github/labels.yml'), JSON.stringify(labels));
    writeFileSync(join(dir, '.coderabbit.yaml'), config);
    return dir;
}

const readConfig = (dir: string): string => readFileSync(join(dir, '.coderabbit.yaml'), 'utf8');

describe('syncCodeRabbitLabels', () => {
    it('writes instructions for labels with ai_apply_when and keeps the rest of the config', async () => {
        const dir = repo();
        expect(await syncCodeRabbitLabels({ root: dir })).toEqual({ errors: [], changed: true });

        const text = readConfig(dir);
        expect(parse(text).reviews.labeling_instructions).toEqual([
            { label: 'Bug', instructions: 'Fixes broken behavior.' },
            { label: 'Blocked', instructions: 'Only when explicitly blocked.' }
        ]);
        expect(parse(text).reviews.poem).toBe(false);
        expect(text).toContain('# Top comment stays.');
        expect(text).toContain('# Comment after the generated block stays.');
        expect(await syncCodeRabbitLabels({ root: dir, check: true })).toEqual({ errors: [], changed: false });
    });

    it('reports stale guidance in check mode without writing', async () => {
        const dir = repo();
        const result = await syncCodeRabbitLabels({ root: dir, check: true });
        expect(result.changed).toBe(true);
        expect(result.errors).toEqual([expect.stringContaining('.coderabbit.yaml is out of date')]);
        expect(readConfig(dir)).toBe(CODERABBIT_CONFIG);
    });

    it('rejects an invalid label catalog', async () => {
        const dir = repo([
            ...LABELS,
            { name: 'Bug', color: 'ffffff' },
            { name: 'Typo', color: 'ffffff', colour: 'ffffff' },
            { name: 'Empty', color: 'ffffff', ai_apply_when: '' },
            { name: 'Long', color: 'ffffff', ai_apply_when: 'x'.repeat(3001) }
        ]);
        const { errors } = await syncCodeRabbitLabels({ root: dir });
        expect(errors).toHaveLength(4);
        expect(readConfig(dir)).toBe(CODERABBIT_CONFIG);
    });

    it('rejects a config that names a label the catalog lacks', async () => {
        const dir = repo(LABELS.filter(({ name }) => name !== 'Slop'));
        const { errors } = await syncCodeRabbitLabels({ root: dir });
        expect(errors).toEqual([expect.stringContaining('"Slop"')]);
        expect(readConfig(dir)).toBe(CODERABBIT_CONFIG);
    });

    it('replaces a block that ends the file', async () => {
        const dir = repo(
            LABELS,
            'reviews:\n    labeling_instructions:\n        - label: Stale\n          instructions: Old.\n'
        );
        expect(await syncCodeRabbitLabels({ root: dir })).toEqual({ errors: [], changed: true });
        expect(parse(readConfig(dir)).reviews.labeling_instructions).toHaveLength(2);
    });
});

describe('writeLabelManifest', () => {
    it.each([
        ['name', { name: '', color: 'ffffff' }],
        ['color', { name: 'Blank', color: '' }],
        ['alias', { name: 'Blank', color: 'ffffff', aliases: [''] }]
    ])('rejects an empty %s and writes no manifest', async (_field, label) => {
        const dir = repo([...LABELS, label]);
        const file = join(dir, 'manifest.yml');
        expect(await writeLabelManifest({ root: dir, file })).toHaveLength(1);
        expect(existsSync(file)).toBe(false);
    });

    it('writes the catalog without the CodeRabbit field', async () => {
        const dir = repo();
        const file = join(dir, 'manifest.yml');
        expect(await writeLabelManifest({ root: dir, file })).toEqual([]);

        const manifest: Array<Record<string, unknown>> = parse(readFileSync(file, 'utf8'));
        expect(manifest.map(({ name }) => name)).toEqual(LABELS.map(({ name }) => name));
        expect(manifest.every((label) => !('ai_apply_when' in label))).toBe(true);
        expect(manifest[1]).toEqual({
            name: 'Question',
            color: 'd876e3',
            description: 'More information is requested'
        });
    });
});
