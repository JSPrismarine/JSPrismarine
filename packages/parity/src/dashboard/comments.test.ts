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

    it('shows suite totals and lists only outcomes that changed', () => {
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
            '0123456789012345678901234567890123456789',
            'https://jsprismarine.dev/parity.html'
        );

        expect(comment).toContain('1/2 passing; 1 failing');
        expect(comment).toContain('1 outcome changes');
        expect(comment).toContain('registry.blocks');
        expect(comment).not.toContain('ships items');
        expect(comment).toContain('Case changes by family');
        expect(comment).toContain('blob/0123456789012345678901234567890123456789/');
        expect(comment).toContain('[Open the full parity tracker]');
    });

    it('summarizes large added inventories by family instead of listing every row', () => {
        const existing = trackerCase();
        const added = Array.from({ length: 50 }, (_, index) =>
            trackerCase({
                id: `packages/parity/src/registry.blocks.test.ts::registry.blocks › added ${index}`,
                title: `Added inventory row ${index}`
            })
        );
        const comment = renderParityComment(
            tracker([existing, ...added]),
            tracker([existing]),
            '0123456789012345678901234567890123456789',
            'https://jsprismarine.dev/parity.html'
        );

        expect(comment).toContain('50 added');
        expect(comment).toContain('**registry.blocks:** +50 cases');
        expect(comment).not.toContain('Added inventory row');
        expect(comment).not.toContain('more relevant cases');
    });

    it('reports added gap cases when the base has no matching row', () => {
        const gap = trackerCase({
            id: 'gap:registry.blocks/minecraft:fixture_block',
            title: 'minecraft:fixture_block',
            kind: 'gap',
            status: 'intentional',
            sourceFile: 'packages/parity/src/allowlist.ts'
        });
        const comment = renderParityComment(
            tracker([trackerCase(), gap]),
            tracker([trackerCase()]),
            '0123456789012345678901234567890123456789',
            'https://jsprismarine.dev/parity.html'
        );

        expect(comment).toContain('Gap: minecraft:fixture_block');
        expect(comment).toContain('intentional');
        expect(comment).toContain('1 intentional differences');
    });
});
