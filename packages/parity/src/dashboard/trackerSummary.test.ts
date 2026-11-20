import { describe, expect, it } from 'vitest';

import type { AllowListEntry } from '../allowlist.ts';
import { FAMILIES } from '../families.ts';
import type { ReportedParityCase, TrackerData } from './tracker.ts';
import { buildTrackerData } from './tracker.ts';
import { summarizeTracker } from './trackerSummary.ts';

const record = (
    family: ReportedParityCase['family'],
    id: string,
    status: ReportedParityCase['status']
): ReportedParityCase => ({
    family,
    id,
    title: id,
    status,
    sourceFile: 'packages/parity/src/registry.blocks.test.ts'
});

const parityCases: ReportedParityCase[] = [
    record(FAMILIES.registryBlocks, 'minecraft:passing_a', 'passed'),
    record(FAMILIES.registryBlocks, 'minecraft:passing_b', 'passed'),
    record(FAMILIES.registryBlocks, 'minecraft:failing', 'failed'),
    record(FAMILIES.registryBlocks, 'minecraft:unmeasured', 'not measured'),
    record(FAMILIES.registryBlocks, 'minecraft:broken_check', 'defect'),
    record(FAMILIES.registryItems, 'minecraft:passing_item', 'passed')
];

const allowList: AllowListEntry[] = [
    {
        family: FAMILIES.registryBlocks,
        id: 'a_deferred_block',
        kind: 'deferred',
        reason: 'The Bedrock capture is not complete.',
        reference: 'issue #7'
    },
    {
        family: FAMILIES.registryBlocks,
        id: 'an_intentional_block',
        kind: 'intentional',
        reason: 'Bedrock does it its own way.',
        reference: 'docs/research/edition-behavior-differences.md'
    },
    {
        family: FAMILIES.registryBlocks,
        id: 'a_broken_block',
        kind: 'defect',
        reason: 'The server has not implemented this value.',
        reference: 'issue #8'
    }
];

const tracker = buildTrackerData(
    { testResults: [] },
    allowList,
    '/workspace',
    '/workspace/packages/parity',
    { generatedAt: '2026-01-01T00:00:00.000Z', sourceCommit: '0123456789012345678901234567890123456789' },
    parityCases
);

/** The snapshot as `docs:stage` writes its index: no family carries its cases, and the chunks hold them. */
const staged: TrackerData = { ...tracker, families: tracker.families.map((family) => ({ ...family, cases: [] })) };

const blocksOf = (summary: ReturnType<typeof summarizeTracker>) => {
    const blocks = summary.families.find((family) => family.id === FAMILIES.registryBlocks);
    if (blocks === undefined) throw new TypeError('The fixture has a block registry family.');
    return blocks;
};

describe('parity tracker summary', () => {
    it('keeps every total and family count, and counts the cases it leaves out', () => {
        const summary = summarizeTracker(tracker, 10);
        const { cases: _cases, families: _families, ...totals } = tracker;

        expect(summary).toMatchObject(totals);
        expect(summary.caseCount).toBe(tracker.cases.length);
        expect(summary.families.map((family) => family.id)).toEqual(tracker.families.map((family) => family.id));
        for (const family of tracker.families) {
            const summarized = summary.families.find(({ id }) => id === family.id);
            const { cases, ...counts } = family;
            expect(summarized).toMatchObject(counts);
            expect(summarized?.caseCount).toBe(cases.length);
        }
    });

    it('carries no case list, only the open gaps', () => {
        const summary = summarizeTracker(tracker, 10);

        expect('cases' in summary).toBe(false);
        for (const family of summary.families) expect('cases' in family).toBe(false);
        expect(blocksOf(summary).openGaps.map((entry) => entry.status)).toEqual([
            'failed',
            'defect',
            'defect',
            'deferred'
        ]);
        expect(summary.families.find(({ id }) => id === FAMILIES.registryItems)?.openGaps).toEqual([]);
    });

    it('lists every open gap the family counts while the limit allows', () => {
        const blocks = blocksOf(summarizeTracker(tracker, 10));

        expect(blocks.openGaps).toHaveLength(blocks.failed + blocks.defects + blocks.deferred);
    });

    it('keeps the most severe gaps when a family has more than the limit', () => {
        const blocks = blocksOf(summarizeTracker(tracker, 2));

        expect(blocks.openGaps.map((entry) => entry.status)).toEqual(['failed', 'defect']);
        expect(blocks.defects).toBe(2);
        expect(blocks.deferred).toBe(1);
    });

    it('summarizes the staged index once its chunks are joined into the case list', () => {
        expect(summarizeTracker(staged, 10)).toEqual(summarizeTracker(tracker, 10));
    });
});
