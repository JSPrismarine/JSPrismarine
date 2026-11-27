import { afterEach, describe, expect, it, vi } from 'vitest';

import { directoriesOf, gateScope, scopeBaseline } from './gate-scope.mts';

describe('gateScope', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('scans everything outside the gate, which leaves JSP_LINT_BASE unset', () => {
        vi.stubEnv('JSP_LINT_BASE', '');

        expect(gateScope(process.cwd(), () => false)).toBeUndefined();
    });

    it('scans everything with JSP_LINT_ALL=1', () => {
        vi.stubEnv('JSP_LINT_BASE', 'HEAD');
        vi.stubEnv('JSP_LINT_ALL', '1');

        expect(gateScope(process.cwd(), () => false)).toBeUndefined();
    });

    it('scans everything when Git cannot list the changes', () => {
        vi.stubEnv('JSP_LINT_BASE', 'no-such-commit-for-the-gate');

        expect(gateScope(process.cwd(), () => false)).toBeUndefined();
    });
});

describe('directoriesOf', () => {
    it('names each directory once', () => {
        expect(directoriesOf(['a/b.ts', 'a/c.ts', 'd.ts'])).toEqual(['.', 'a']);
    });
});

describe('scopeBaseline', () => {
    const baseline = {
        'pkg/src/a.ts': { rule: 1 },
        'pkg/src/b.ts': { rule: 2 },
        'pkg/package.json': { rule: 1 }
    };

    it('keeps the entries of the scanned files and of any file the scan found something in', () => {
        const scoped = scopeBaseline(baseline, (file) => file === 'pkg/src/a.ts', { 'pkg/package.json': { rule: 1 } });

        expect(scoped).toEqual({ 'pkg/src/a.ts': { rule: 1 }, 'pkg/package.json': { rule: 1 } });
    });

    it('drops the entries of files outside the scan, which it did not read', () => {
        expect(scopeBaseline(baseline, () => false, {})).toEqual({});
    });
});
