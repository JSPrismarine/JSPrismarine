import { describe, expect, it } from 'vitest';

import type { AllowListEntry } from '../allowlist.ts';
import { FAMILIES } from '../families.ts';
import type { VitestJsonReport } from './render.ts';
import type { ReportedParityCase } from './tracker.ts';
import {
    buildTrackerData,
    trackerPrimaryProgressPercent,
    trackerProgressPercent,
    trackerProgressTotal
} from './tracker.ts';

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
                    ancestorTitles: [FAMILIES.conformanceClaim],
                    title: 'records the claim',
                    status: 'passed'
                },
                {
                    ancestorTitles: [FAMILIES.worldgenFeatures],
                    title: 'not measured: no distribution',
                    status: 'skipped'
                }
            ]
        }
    ]
};

const parityCases: ReportedParityCase[] = [
    {
        family: FAMILIES.registryBlocks,
        id: 'minecraft:fixture_block',
        title: 'minecraft:fixture_block',
        context: 'Java block registry mapping',
        status: 'failed',
        sourceFile: 'packages/parity/src/registry.blocks.test.ts'
    }
];

const allowList: AllowListEntry[] = [
    {
        family: FAMILIES.registryBlocks,
        id: 'minecraft:fixture_block#hardness',
        kind: 'intentional',
        reason: 'The reference format omits the property.',
        reference: 'docs/plans/data-driven-vanilla.md section 12, issue #123, https://example.com/decision'
    },
    {
        family: FAMILIES.registryBlocks,
        id: 'fixture_deferred_block',
        kind: 'deferred',
        reason: 'The Bedrock capture is not complete.',
        reference: 'docs/research/edition-behavior-differences.md'
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
    it('counts deferred work and known defects against parity progress', () => {
        expect(trackerProgressTotal({ checks: 100, deferred: 3, defects: 2 })).toBe(105);
    });

    it('shows concise progress without rounding incomplete coverage up to 100 percent', () => {
        expect(trackerProgressPercent(0, 0)).toBe('0');
        expect(trackerProgressPercent(32_000, 32_000)).toBe('100');
        expect(trackerProgressPercent(31_999, 32_000)).toBe('99.9');
        expect(trackerProgressPercent(1_000_000, 1_000_001)).toBe('99.9');
    });

    it('shows the primary tracked-case pass rate to two decimal places', () => {
        expect(trackerPrimaryProgressPercent(49_678, 52_806)).toBe('94.08');
        expect(trackerPrimaryProgressPercent(9_999, 10_000)).toBe('99.99');
        expect(trackerPrimaryProgressPercent(10_000, 10_000)).toBe('100');
    });

    it('includes explicit data comparisons and excludes ordinary parity-suite assertions', () => {
        const tracker = buildTrackerData(
            report,
            allowList,
            repositoryRoot,
            parityRoot,
            {
                generatedAt: '2026-01-01T00:00:00.000Z',
                sourceCommit: '0123456789012345678901234567890123456789'
            },
            parityCases
        );

        expect(tracker.cases[0]).toMatchObject({
            title: 'minecraft:fixture_block',
            context: 'Java block registry mapping',
            status: 'failed',
            sourceFile: 'packages/parity/src/registry.blocks.test.ts'
        });
        expect(tracker.cases[1]).toMatchObject({ family: FAMILIES.worldgenFeatures, status: 'not measured' });
        expect(tracker.cases).toHaveLength(5);
        expect(tracker.cases.some(({ title }) => title === 'records the claim')).toBe(false);
        expect(tracker.checks).toBe(2);
        expect(tracker.passed).toBe(0);
        expect(tracker.failed).toBe(1);
        expect(tracker.notMeasured).toBe(1);
        expect(tracker.intentional).toBe(1);
        expect(tracker.deferred).toBe(1);
        expect(tracker.defects).toBe(1);
        expect(tracker.sourceCommit).toBe('0123456789012345678901234567890123456789');
        expect(tracker.cases[2]?.references).toEqual([
            {
                text: 'docs/plans/data-driven-vanilla.md',
                href: 'https://github.com/JSPrismarine/JSPrismarine/blob/0123456789012345678901234567890123456789/docs/plans/data-driven-vanilla.md'
            },
            { text: ' section 12, ' },
            {
                text: '#123',
                href: 'https://github.com/JSPrismarine/JSPrismarine/issues/123'
            },
            { text: ', ' },
            { text: 'https://example.com/decision', href: 'https://example.com/decision' }
        ]);
        expect(tracker.cases[3]).toMatchObject({ status: 'deferred' });
    });

    it('merges measured entity runtime support into the not-measured behavior row', () => {
        const tracker = buildTrackerData(report, [], repositoryRoot, parityRoot, {}, [
            {
                family: FAMILIES.entitiesBehavior,
                id: 'runtime-behavior:minecraft:ender_dragon',
                title: 'minecraft:ender_dragon',
                context: 'Complete Java entity behavior parity is not measured.',
                status: 'not measured',
                sourceFile: 'packages/parity/src/runtime-behavior-coverage.test.ts',
                runtimeSupport: {
                    status: 'not checked',
                    details: 'Runtime source data is unavailable.'
                }
            },
            {
                family: FAMILIES.entitiesBehavior,
                id: 'runtime-behavior:minecraft:ender_dragon',
                title: 'minecraft:ender_dragon',
                status: 'not measured',
                sourceFile: 'packages/parity/src/integration.test.ts',
                runtimeSupport: {
                    status: 'partial',
                    details: 'Spawnable with unresolved component declarations.'
                }
            }
        ]);

        const dragonCases = tracker.cases.filter(({ title }) => title === 'minecraft:ender_dragon');
        expect(dragonCases).toHaveLength(1);
        expect(dragonCases[0]).toMatchObject({
            family: FAMILIES.entitiesBehavior,
            status: 'not measured',
            context: 'Complete Java entity behavior parity is not measured.',
            sourceFile: 'packages/parity/src/integration.test.ts',
            runtimeSupport: { status: 'partial', details: 'Spawnable with unresolved component declarations.' }
        });
    });

    it('omits families with no parity cases from the snapshot', () => {
        const tracker = buildTrackerData(report, allowList, repositoryRoot, parityRoot, {}, parityCases);

        expect(tracker.families.map(({ id }) => id)).toContain(FAMILIES.registryBlocks);
        expect(tracker.families.map(({ id }) => id)).not.toContain(FAMILIES.registryItems);
        expect(tracker.families.every((family) => family.cases.length > 0)).toBe(true);
        expect(tracker.families.map(({ id }) => id)).toEqual(
            expect.arrayContaining([FAMILIES.registryBlocks, FAMILIES.worldgenFeatures])
        );
        expect(tracker.families.some((family) => family.id === '(other)')).toBe(false);
    });
});
