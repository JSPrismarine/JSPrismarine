import { describe, expect, it } from 'vitest';

import type { AllowListEntry } from '../allowlist.ts';
import { FAMILIES } from '../families.ts';
import type { VitestJsonReport } from './render.ts';
import { renderDashboard } from './render.ts';

const fixtureReport: VitestJsonReport = {
    testResults: [
        {
            assertionResults: [
                { ancestorTitles: ['registry.blocks'], status: 'passed', title: 'ships every block' },
                { ancestorTitles: ['registry.blocks'], status: 'passed', title: 'no stale entries' },
                { ancestorTitles: ['registry.items'], status: 'failed', title: 'ships every item' },
                { ancestorTitles: ['registry.items'], status: 'passed', title: 'no stale entries' },
                { ancestorTitles: ['allow list'], status: 'passed', title: 'reports unexpected gaps' },
                { ancestorTitles: ['registry.blocks'], status: 'skipped', title: 'skipped counts nowhere' }
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
        reason: 'fixture',
        reference: 'this test'
    },
    { family: FAMILIES.registryItems, id: 'table:minecraft:fixture_item', reason: 'fixture', reference: 'this test' }
];

describe('dashboard renderer', () => {
    it('renders one row per family with passed, failed and allow-listed counts', () => {
        expect(renderDashboard(fixtureReport, fixtureAllowList)).toBe(
            [
                '# Parity dashboard',
                '',
                '| Family | Passed | Failed | Allow-listed |',
                '| --- | ---: | ---: | ---: |',
                '| (other) | 1 | 0 | 0 |',
                '| conformance.claim | 1 | 0 | 0 |',
                '| registry.blocks | 2 | 0 | 0 |',
                '| registry.items | 1 | 1 | 2 |',
                '| **total** | 5 | 1 | 2 |',
                ''
            ].join('\n')
        );
    });

    it('renders a family that only has allow-list entries', () => {
        const markdown = renderDashboard({ testResults: [] }, fixtureAllowList);

        expect(markdown).toContain('| registry.items | 0 | 0 | 2 |');
    });

    it('renders an empty report as a table with only the total row', () => {
        const markdown = renderDashboard({ testResults: [] }, []);

        expect(markdown).toContain('| **total** | 0 | 0 | 0 |');
        expect(markdown).not.toContain('| registry.');
    });
});
