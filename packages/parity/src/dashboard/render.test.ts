import { describe, expect, it } from 'vitest';

import type { AllowListEntry } from '../allowlist.ts';
import { ALL_FAMILIES, FAMILIES } from '../families.ts';
import type { ParityMeasurement } from '../progress.ts';
import type { VitestJsonReport } from './render.ts';
import { familiesWithoutTests, renderDashboard, statusOf } from './render.ts';

const fixtureReport: VitestJsonReport = {
    testResults: [
        {
            assertionResults: [
                { ancestorTitles: ['registry.blocks'], status: 'passed', title: 'ships every block' },
                { ancestorTitles: ['registry.blocks'], status: 'passed', title: 'no stale entries' },
                { ancestorTitles: ['registry.items'], status: 'failed', title: 'ships every item' },
                { ancestorTitles: ['registry.items'], status: 'passed', title: 'no stale entries' },
                { ancestorTitles: ['allow list'], status: 'passed', title: 'reports unexpected gaps' },
                { ancestorTitles: ['worldgen.features'], status: 'skipped', title: 'not measured: no distribution' }
            ]
        },
        {
            assertionResults: [{ ancestorTitles: ['conformance.claim'], status: 'passed', title: 'states the claim' }]
        }
    ]
};

const fixtureAllowList: AllowListEntry[] = [
    {
        family: FAMILIES.registryItems,
        id: 'sources-disagree:minecraft:fixture_item',
        kind: 'accepted',
        reason: 'fixture',
        reference: 'this test'
    },
    {
        family: FAMILIES.blocksProperties,
        id: 'minecraft:fixture_block#hardness',
        kind: 'defect',
        reason: 'fixture',
        reference: 'this test'
    }
];

/** The row for one family, without the trailing newline. */
const rowFor = (markdown: string, family: string): string =>
    markdown.split('\n').find((line) => line.startsWith(`| ${family} |`)) ?? `<no row for ${family}>`;

describe('dashboard renderer', () => {
    it('gives every declared family a row, whether or not a test claimed it', () => {
        const markdown = renderDashboard({ testResults: [] }, []);

        for (const family of ALL_FAMILIES) expect(rowFor(markdown, family)).toContain('no tests');
    });

    it('identifies declared rows with no test for the CI coverage guard', () => {
        const report: VitestJsonReport = {
            testResults: [
                {
                    assertionResults: [
                        { ancestorTitles: [FAMILIES.registryBlocks], status: 'passed', title: 'resolves a block' },
                        { ancestorTitles: ['allow list'], status: 'passed', title: 'checks its entries' }
                    ]
                }
            ]
        };

        const missing = familiesWithoutTests(report);

        expect(missing).not.toContain(FAMILIES.registryBlocks);
        expect(missing).toContain(FAMILIES.integrationTags);
    });

    it('counts passed, failed, not-measured, accepted and defect columns separately', () => {
        const markdown = renderDashboard(fixtureReport, fixtureAllowList);

        expect(rowFor(markdown, 'registry.blocks')).toBe('| registry.blocks | green | 2 | 0 | 0 | 0 | 0 |');
        expect(rowFor(markdown, 'registry.items')).toBe('| registry.items | red | 1 | 1 | 0 | 1 | 0 |');
        expect(rowFor(markdown, 'worldgen.features')).toBe('| worldgen.features | not measured | 0 | 0 | 1 | 0 | 0 |');
        expect(rowFor(markdown, 'blocks.properties')).toBe('| blocks.properties | no tests | 0 | 0 | 0 | 0 | 1 |');
        expect(rowFor(markdown, '(other)')).toBe('| (other) | green | 1 | 0 | 0 | 0 | 0 |');
    });

    it('explains what a not-measured row means, so green is not the only legible state', () => {
        const markdown = renderDashboard(fixtureReport, fixtureAllowList);

        expect(markdown).toContain('A row is green only when every one of its tests compared real reference data');
        expect(markdown).toContain('`not measured` means a comparison found no reference data');
    });

    it('renders non-gating coverage measurements for the PR trend comment', () => {
        const measurements: ParityMeasurement[] = [
            { family: FAMILIES.integrationTags, name: 'block_memberships', value: 18 }
        ];

        const markdown = renderDashboard(fixtureReport, fixtureAllowList, measurements);

        expect(markdown).toContain('## Coverage measurements');
        expect(markdown).toContain('| integration.tags | block_memberships | 18 |');
    });

    it('reads a defect-only family as defects rather than green', () => {
        expect(statusOf({ passed: 3, failed: 0, notMeasured: 0, accepted: 0, defects: 1 })).toBe('defects');
        expect(statusOf({ passed: 3, failed: 0, notMeasured: 0, accepted: 2, defects: 0 })).toBe('green');
    });

    it('reads a failure as red even when something else was not measured', () => {
        expect(statusOf({ passed: 1, failed: 1, notMeasured: 1, accepted: 0, defects: 0 })).toBe('red');
    });
});
