import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { CHECK_INPUTS, customChecks, FORMATTER_SCRIPTS, gateScripts } from './lint-gate-checks.mts';

const manifest: { scripts: Record<string, string> } = JSON.parse(
    readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8')
);
const checks = customChecks(manifest.scripts['lint:custom'] ?? '');
const modified = (...paths: string[]) => paths.map((file) => ({ path: file, added: false }));

describe('customChecks', () => {
    it('reads every check lint:custom runs, and each has inputs', () => {
        expect(checks).toContain('lint:barrels');
        expect(checks.filter((check) => !(check in CHECK_INPUTS))).toEqual([]);
    });

    it('lists no check that lint:custom has dropped', () => {
        expect(Object.keys(CHECK_INPUTS).filter((check) => !checks.includes(check))).toEqual([]);
    });
});

describe('gateScripts', () => {
    it('runs nothing for no changes', () => {
        expect(gateScripts(checks, [])).toEqual([]);
    });

    it('runs the formatters, encoding and docs facts checks for a guide edit', () => {
        const scripts = gateScripts(checks, modified('docs/guide/getting-started.md'));
        expect(scripts).toEqual([...FORMATTER_SCRIPTS, 'lint:encoding', 'lint:docs-facts']);
    });

    it('runs the wire layout check for a protocol packet and not the packet codec check', () => {
        const scripts = gateScripts(checks, modified('packages/protocol/src/bedrock/packet/TextPacket.ts'));
        expect(scripts).toContain('lint:wire-layouts');
        expect(scripts).toContain('lint:jsdoc');
        expect(scripts).not.toContain('lint:packets');
        expect(scripts).not.toContain('lint:american-filenames');
    });

    it('checks file names only for an added path', () => {
        const added = gateScripts(checks, [{ path: 'docs/guide/new.md', added: true }]);
        expect(added).toContain('lint:american-filenames');
    });

    it.each(['package.json', 'pnpm-lock.yaml'])('runs every check when %s changes', (file) => {
        expect(gateScripts(checks, modified(file))).toEqual([...FORMATTER_SCRIPTS, ...checks]);
    });

    it('runs a check it has no inputs for', () => {
        expect(gateScripts(['lint:new-check'], modified('README.md'))).toContain('lint:new-check');
    });
});
