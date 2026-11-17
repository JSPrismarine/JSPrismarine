import { describe, expect, it } from 'vitest';

import { runScenarios } from '../behaviorScenarios.ts';
import { expectedOnJsp, scenarioRecordComparison } from './describeScriptingFamily.ts';
import type { ScenarioRecord } from './record.ts';
import { readScenarioGolden } from './record.ts';
import { SCRIPT_SCENARIOS } from './scenarios.ts';

const moduleResolution = SCRIPT_SCENARIOS.find((scenario) => scenario.id === 'module-resolution');

describe('scenarioRecordComparison', () => {
    const golden = readScenarioGolden('module-resolution');
    if (moduleResolution === undefined || golden === undefined) throw new Error('module-resolution has a golden');
    const rowFor = (record: ScenarioRecord) =>
        runScenarios([scenarioRecordComparison([moduleResolution], new Map([[moduleResolution.id, record]]))])[0];

    it('reports a difference JSPrismarine makes on purpose as intentional, with its reason and its ADR', () => {
        const row = rowFor(expectedOnJsp(golden, moduleResolution));

        expect(row?.difference).toContain('import @jsprismarine/server');
        expect(row?.gap).toEqual({
            kind: 'intentional',
            reason: expect.stringContaining('resolves an undeclared @jsprismarine/server'),
            reference: 'docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md'
        });
    });

    it('reports any other difference as a defect, the BDS record itself included', () => {
        const row = rowFor(golden);

        expect(row?.gap?.kind).toBe('defect');
    });
});
