import { describe, expect, it } from 'vitest';

import type { AllowListEntry } from '../allowlist.ts';
import { ALL_FAMILIES, FAMILIES } from '../families.ts';
import type { VitestJsonReport } from './render.ts';
import { buildTrackerData } from './tracker.ts';

const repositoryRoot = '/workspace';
const parityRoot = `${repositoryRoot}/packages/parity`;

const report: VitestJsonReport = {
    testResults: [
        {
            name: 'packages/parity/src/registry.blocks.test.ts',
            assertionResults: [
                {
                    ancestorTitles: [FAMILIES.registryBlocks, 'block palette'],
                    title: 'contains every captured block',
                    status: 'passed',
                    location: { line: 32, column: 9 }
                },
                {
                    ancestorTitles: [FAMILIES.registryBlocks, 'state palette'],
                    title: 'matches the captured properties',
                    status: 'failed'
                },
                {
                    ancestorTitles: ['dashboard renderer'],
                    title: 'renders every family',
                    status: 'skipped'
                }
            ]
        }
    ]
};

const allowList: AllowListEntry[] = [
    {
        family: FAMILIES.registryBlocks,
        id: 'minecraft:fixture_block#hardness',
        kind: 'accepted',
        reason: 'The reference format omits the property.',
        reference: 'fixture reference'
    },
    {
        family: FAMILIES.registryBlocks,
        id: 'minecraft:broken_block#hardness',
        kind: 'defect',
        reason: 'The server has not implemented this value.',
        reference: 'fixture issue'
    }
];

describe('parity tracker data', () => {
    it('includes every declared-family assertion and skips suite helper tests', () => {
        const tracker = buildTrackerData(report, allowList, repositoryRoot, parityRoot, {
            generatedAt: '2026-01-01T00:00:00.000Z',
            sourceCommit: 'abc123'
        });

        expect(
            tracker.cases.slice(0, 2).map(({ title, context, status, sourceFile, line }) => ({
                title,
                context,
                status,
                sourceFile,
                line
            }))
        ).toEqual([
            {
                title: 'contains every captured block',
                context: 'block palette',
                status: 'passed',
                sourceFile: 'packages/parity/src/registry.blocks.test.ts',
                line: 32
            },
            {
                title: 'matches the captured properties',
                context: 'state palette',
                status: 'failed',
                sourceFile: 'packages/parity/src/registry.blocks.test.ts',
                line: undefined
            }
        ]);
        expect(tracker.cases).toHaveLength(4);
        expect(tracker.checks).toBe(2);
        expect(tracker.passed).toBe(1);
        expect(tracker.failed).toBe(1);
        expect(tracker.notMeasured).toBe(0);
        expect(tracker.accepted).toBe(1);
        expect(tracker.defects).toBe(1);
        expect(tracker.sourceCommit).toBe('abc123');
    });

    it('keeps declared families with no comparisons in the snapshot', () => {
        const tracker = buildTrackerData(report, allowList, repositoryRoot, parityRoot);
        const emptyFamily = tracker.families.find((family) => family.id === FAMILIES.registryItems);

        expect(tracker.families.map(({ id }) => id)).toEqual(expect.arrayContaining([...ALL_FAMILIES]));
        expect(emptyFamily).toMatchObject({ checks: 0, passed: 0, cases: [] });
        expect(tracker.families.some((family) => family.id === '(other)')).toBe(false);
    });
});
