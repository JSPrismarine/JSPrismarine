import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { isCheckable, LINT_INPUTS, lintTargets } from './lint-changed.mts';

const everywhere = (): boolean => true;

describe('lintTargets', () => {
    it('returns the changed files once each, in order', () => {
        expect(lintTargets(['b.ts', 'a.md', 'b.ts'], everywhere)).toEqual(['a.md', 'b.ts']);
    });

    it('leaves out a deleted file', () => {
        expect(lintTargets(['kept.ts', 'gone.ts'], (file) => file !== 'gone.ts')).toEqual(['kept.ts']);
    });

    it('returns no files when nothing changed', () => {
        expect(lintTargets([], everywhere)).toEqual([]);
    });

    it.each([...LINT_INPUTS, '.prettierrc.json'])('checks every file when %s changes', (file) => {
        expect(lintTargets(['src/a.ts', file], everywhere)).toBe('all');
    });

    it('scopes a package manifest to itself', () => {
        expect(lintTargets(['packages/raknet/package.json'], everywhere)).toEqual(['packages/raknet/package.json']);
    });
});

describe('isCheckable', () => {
    it('accepts a file, and leaves out a missing path and a symbolic link', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-changed-'));
        try {
            fs.mkdirSync(path.join(dir, 'skill'));
            fs.writeFileSync(path.join(dir, 'skill', 'SKILL.md'), '# Skill\n');
            fs.symlinkSync('skill', path.join(dir, 'link'));
            expect(isCheckable(path.join(dir, 'skill', 'SKILL.md'))).toBe(true);
            expect(isCheckable(path.join(dir, 'link'))).toBe(false);
            expect(isCheckable(path.join(dir, 'gone.md'))).toBe(false);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
