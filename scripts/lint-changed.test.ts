import { describe, expect, it } from 'vitest';

import { LINT_INPUTS, lintTargets } from './lint-changed.mts';

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
