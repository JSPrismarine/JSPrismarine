import { describe, expect, it } from 'vitest';

import { findParityComment, renderParityComment } from './comments.ts';
import type { TrackerCase, TrackerData } from './tracker.ts';

const trackerCase = (overrides: Partial<TrackerCase> = {}): TrackerCase => ({
    id: 'packages/parity/src/registry.blocks.test.ts::registry.blocks › ships blocks',
    family: 'registry.blocks',
    title: 'ships blocks',
    context: '',
    kind: 'check',
    status: 'passed',
    sourceFile: 'packages/parity/src/registry.blocks.test.ts',
    ...overrides
});

const tracker = (cases: readonly TrackerCase[]): TrackerData => ({
    generatedAt: '2026-01-01T00:00:00.000Z',
    sourceCommit: 'abc123',
    families: [],
    cases,
    checks: cases.filter((entry) => entry.kind === 'check').length,
    passed: cases.filter((entry) => entry.kind === 'check' && entry.status === 'passed').length,
    failed: cases.filter((entry) => entry.kind === 'check' && entry.status === 'failed').length,
    notMeasured: cases.filter((entry) => entry.kind === 'check' && entry.status === 'not measured').length,
    intentional: cases.filter((entry) => entry.status === 'intentional').length,
    deferred: cases.filter((entry) => entry.status === 'deferred').length,
    defects: cases.filter((entry) => entry.status === 'defect').length
});

describe('parity report comment lookup', () => {
    it('returns the newest existing bot report so CI can update it', () => {
        const comments = [
            { id: 4, body: '<!-- parity-report --> old report', user: { login: 'github-actions[bot]' } },
            { id: 5, body: '<!-- parity-report --> user note', user: { login: 'contributor' } },
            { id: 9, body: '<!-- parity-report --> latest report', user: { login: 'github-actions[bot]' } }
        ];

        expect(findParityComment(comments, '<!-- parity-report -->')).toEqual(comments[2]);
    });

    it('returns no match when the bot has not posted the report yet', () => {
        const comments = [{ id: 4, body: 'a user comment', user: { login: 'contributor' } }];

        expect(findParityComment(comments, '<!-- parity-report -->')).toBeUndefined();
    });

    it('shows suite totals and only changed or directly touched cases', () => {
        const changed = trackerCase({ status: 'failed' });
        const untouched = trackerCase({
            id: 'packages/parity/src/registry.items.test.ts::registry.items › ships items',
            family: 'registry.items',
            title: 'ships items',
            sourceFile: 'packages/parity/src/registry.items.test.ts'
        });
        const comment = renderParityComment(
            tracker([changed, untouched]),
            tracker([trackerCase(), untouched]),
            ['packages/parity/src/registry.blocks.test.ts'],
            '0123456789012345678901234567890123456789',
            'https://jsprismarine.github.io/JSPrismarine/parity.html'
        );

        expect(comment).toContain('1/2 passing; 1 failing');
        expect(comment).toContain('1 outcome changes');
        expect(comment).toContain('registry.blocks');
        expect(comment).not.toContain('ships items');
        expect(comment).toContain('blob/0123456789012345678901234567890123456789/');
        expect(comment).toContain('[Open the full parity tracker]');
    });

    it('reports added gap cases in changed allow-list files', () => {
        const gap = trackerCase({
            id: 'gap:registry.blocks/minecraft:fixture_block',
            title: 'minecraft:fixture_block',
            kind: 'gap',
            status: 'intentional',
            sourceFile: 'packages/parity/src/allowlist.ts'
        });
        const comment = renderParityComment(
            tracker([gap]),
            tracker([]),
            ['packages/parity/src/allowlist.ts'],
            '0123456789012345678901234567890123456789',
            'https://jsprismarine.github.io/JSPrismarine/parity.html'
        );

        expect(comment).toContain('Gap: minecraft:fixture_block');
        expect(comment).toContain('intentional');
        expect(comment).toContain('intentional differences +1');
    });
});
