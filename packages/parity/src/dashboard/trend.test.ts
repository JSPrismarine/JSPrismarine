import { describe, expect, it } from 'vitest';

import { describeParityTrend, parseDashboardMeasurements, parseDashboardTotals } from './trend';
import type { DashboardTotals } from './trend';

const dashboard = `# Parity dashboard

| Family | Status | Passed | Failed | Not measured | Accepted gaps | Known defects |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| registry.blocks | green | 3 | 0 | 0 | 1 | 0 |
| **total** | green | 3 | 0 | 0 | 1 | 0 |

## Coverage measurements

| Family | Measurement | Current |
| --- | --- | ---: |
| integration.tags | block_memberships | 18 |
| integration.tags | item_tags | 4 |
`;

const totals = (overrides: Partial<DashboardTotals> = {}): DashboardTotals => ({
    passed: 3,
    failed: 0,
    notMeasured: 0,
    accepted: 1,
    defects: 0,
    ...overrides
});

describe('parity dashboard trend', () => {
    it('reads the generated totals row', () => {
        expect(parseDashboardTotals(dashboard)).toEqual(totals());
    });

    it('reads measured data volume from the dashboard comment', () => {
        expect(parseDashboardMeasurements(dashboard)).toEqual([
            { family: 'integration.tags', name: 'block_memberships', value: 18 },
            { family: 'integration.tags', name: 'item_tags', value: 4 }
        ]);
    });

    it('reads measurements from the folded entity detail table', () => {
        const withEntityDetails = `${dashboard}
<details><summary>Entity-level details (1 measurements)</summary>

| Family | Measurement | Current |
| --- | --- | ---: |
| integration.entity-coverage | entity:minecraft:zombie:component-coverage | 3 |

</details>
`;

        expect(parseDashboardMeasurements(withEntityDetails)).toEqual([
            { family: 'integration.tags', name: 'block_memberships', value: 18 },
            { family: 'integration.tags', name: 'item_tags', value: 4 },
            { family: 'integration.entity-coverage', name: 'entity:minecraft:zombie:component-coverage', value: 3 }
        ]);
    });

    it('rejects a report without a totals row', () => {
        expect(() => parseDashboardTotals('# Parity dashboard')).toThrow('no total row');
    });

    it('establishes a baseline on the first report', () => {
        expect(describeParityTrend(undefined, totals({ defects: 2 }))).toBe(
            'Baseline established: 2 open gaps (failed comparisons plus known defects).'
        );
    });

    it('reports when open parity gaps fall or rise', () => {
        expect(describeParityTrend(totals({ failed: 1, defects: 1 }), totals({ failed: 0 }))).toContain(
            'Parity improved: open gaps fell from 2 to 0.'
        );
        expect(describeParityTrend(totals(), totals({ failed: 1 }))).toContain(
            'Parity regressed: open gaps rose from 0 to 1.'
        );
    });

    it('reports added passing coverage when the open gap count is unchanged', () => {
        expect(describeParityTrend(totals(), totals({ passed: 4 }))).toContain(
            'Parity coverage increased: more comparisons passed, with 0 open gaps.'
        );
    });

    it('reports data-driven coverage increases and drops between reports', () => {
        const prior = parseDashboardMeasurements(dashboard);
        const current = [
            { family: 'integration.tags', name: 'block_memberships', value: 20 },
            { family: 'integration.tags', name: 'item_tags', value: 3 }
        ];

        expect(describeParityTrend(totals(), totals(), prior, current)).toContain(
            'Coverage measurements increased: integration.tags/block_memberships +2; fell: integration.tags/item_tags -1.'
        );
    });

    it('summarizes entity-level changes without listing every entity identifier', () => {
        const prior = [
            { family: 'integration.entity-coverage', name: 'entity:minecraft:zombie:component-coverage', value: 3 },
            { family: 'integration.entity-coverage', name: 'entity:minecraft:skeleton:component-coverage', value: 2 }
        ];
        const current = [
            { family: 'integration.entity-coverage', name: 'entity:minecraft:zombie:component-coverage', value: 4 },
            { family: 'integration.entity-coverage', name: 'entity:minecraft:creeper:component-coverage', value: 3 }
        ];

        const trend = describeParityTrend(totals(), totals(), prior, current);

        expect(trend).toContain('entity detail measurements: 1 added, 1 increased, 1 removed');
        expect(trend).not.toContain('minecraft:zombie');
        expect(trend).not.toContain('minecraft:skeleton');
        expect(trend).not.toContain('minecraft:creeper');
    });
});
