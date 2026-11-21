import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { INPUT_GLOBS, fingerprint, inputsChanged, isInput } from './inputs.mts';

const REPO = path.resolve(import.meta.dirname, '..', '..', '..');
const entry = (file: string, blob: string) => `100644 blob ${blob}\t${file}`;

describe('INPUT_GLOBS', () => {
    it('matches the push paths the benchmark workflow runs on', () => {
        const workflow = readFileSync(path.join(REPO, '.github', 'workflows', 'benchmark.yml'), 'utf8');
        const block = /^ {8}paths:\n((?: {12}- .+\n)+)/m.exec(workflow)?.[1] ?? '';
        const paths = [...block.matchAll(/- '(.+)'/g)].map((match) => match[1]);
        expect(paths).toEqual([...INPUT_GLOBS]);
    });
});

describe('isInput', () => {
    it('counts server code and pins, and leaves docs and tests in packages out', () => {
        expect(isInput('packages/server/src/Server.ts')).toBe(true);
        expect(isInput('packages/bedrock-data/sources.json')).toBe(true);
        expect(isInput('tools/server-benchmark/pumpkin.json')).toBe(true);
        expect(isInput('.nvmrc')).toBe(true);
        expect(isInput('packages/server/README.md')).toBe(false);
        expect(isInput('packages/server/src/Server.test.ts')).toBe(false);
        expect(isInput('docs/guide/index.md')).toBe(false);
        expect(isInput('.nvmrc.bak')).toBe(false);
    });
});

describe('fingerprint', () => {
    it('changes with an input and ignores every other file', () => {
        const base = [entry('packages/server/src/Server.ts', 'a'), entry('pnpm-lock.yaml', 'b')];
        const same = fingerprint(base.join('\n'));
        expect(fingerprint([...base, entry('packages/server/README.md', 'c')].join('\n'))).toBe(same);
        expect(fingerprint([...base, entry('packages/server/src/Server.test.ts', 'd')].join('\n'))).toBe(same);
        expect(fingerprint([entry('packages/server/src/Server.ts', 'e'), base[1]].join('\n'))).not.toBe(same);
    });
});

describe('inputsChanged', () => {
    let dir: string | undefined;
    afterEach(() => {
        if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
        dir = undefined;
    });

    const write = (date: string, inputs?: string) => {
        dir ??= mkdtempSync(path.join(tmpdir(), 'jsp-inputs-'));
        mkdirSync(path.join(dir, date));
        writeFileSync(path.join(dir, date, 'results.json'), JSON.stringify(inputs === undefined ? {} : { inputs }));
        return dir;
    };

    it('compares with the newest results file only', () => {
        write('2026-11-21', 'old');
        const benchmarks = write('2026-11-22', 'new');
        expect(inputsChanged('new', benchmarks)).toBe(false);
        expect(inputsChanged('old', benchmarks)).toBe(true);
    });

    it('counts a file without a fingerprint, no file and uncommitted inputs as changed', () => {
        expect(inputsChanged('new', path.join(tmpdir(), 'jsp-inputs-missing'))).toBe(true);
        const benchmarks = write('2026-11-21');
        expect(inputsChanged('new', benchmarks)).toBe(true);
        expect(inputsChanged(null, benchmarks)).toBe(true);
    });
});
