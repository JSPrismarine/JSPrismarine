import { it } from 'vitest';

import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { measureScenarios, scenarioGroup } from '../behaviorScenarios.ts';
import { describeFamily } from '../measure.ts';
import { scriptingGoldens } from '../references.ts';
import { runScenarioOnJsp } from './jspHost.ts';
import type { ScenarioRecord } from './record.ts';
import { diffScenarioRecords, readScenarioGolden } from './record.ts';
import type { ScriptingFamily, ScriptScenario } from './scenarios.ts';
import { SCRIPT_SCENARIOS } from './scenarios.ts';

/** What a scenario row reports while JSPrismarine cannot run its scripts. */
export const NO_SCRIPT_HOST = 'JSPrismarine has no script host to run the scenario';

/** Where the missing script host is tracked, cited by every row that waits on it. */
export const SCRIPT_HOST_ISSUE = 'issue #3203';

/**
 * The comparison behind every scripting row: JSPrismarine's record of a scenario against the
 * golden the pinned Bedrock Dedicated Server produced.
 *
 * @param records - JSPrismarine's record of each scenario by id, undefined while it has no
 *   script host. The records are taken before the rows run, because the host is asynchronous
 *   and a row is not.
 */
export const scenarioRecordComparison = (
    scenarios: readonly ScriptScenario[],
    records: ReadonlyMap<string, ScenarioRecord | undefined>
): BehaviorScenario<ScriptScenario> => ({
    name: 'bds-record',
    java: "The scenario's scripts record the same observations, in the same order, as on the pinned Bedrock Dedicated Server.",
    reference: 'packages/parity/goldens/scripting',
    subjects: () => scenarios,
    idOf: (scenario) => scenario.id,
    // A scenario is its own row; it evidences no single Java or Bedrock identifier.
    covers: () => undefined,
    run: (scenario) => {
        const golden = readScenarioGolden(scenario.id);
        if (golden === undefined) {
            return 'no BDS golden; run `pnpm --filter @jsprismarine/parity run capture:scripting`';
        }
        const record = records.get(scenario.id);
        if (record === undefined) return NO_SCRIPT_HOST;
        return diffScenarioRecords(golden, record);
    },
    classify: (scenario, difference) =>
        difference === NO_SCRIPT_HOST
            ? {
                  kind: 'deferred',
                  reason: `JSPrismarine cannot run behavior pack scripts yet. On BDS: ${scenario.description}`,
                  reference: SCRIPT_HOST_ISSUE
              }
            : {
                  kind: 'defect',
                  reason: `${scenario.description} Observed: ${difference}.`,
                  reference: scenario.reference
              }
});

/**
 * Declares one scripting family's tests: a row per scenario of the family, each comparing
 * JSPrismarine's record with the BDS golden.
 *
 * A family with no captured scenario reports "not measured". Rows that differ are checked
 * against `goldens/behavior-gaps.json`, and `PARITY_UPDATE_BEHAVIOR_GAPS=1` rewrites the family's
 * baseline from what they observed.
 * @param family - The family, which is also the describe title the dashboard groups by.
 * @param sourceFile - The test file, for the tracker's source link.
 */
export const describeScriptingFamily = (family: ScriptingFamily, sourceFile: string): void => {
    const scenarios = SCRIPT_SCENARIOS.filter((scenario) => scenario.family === family);

    describeFamily(family, [scriptingGoldens(family)], () => {
        it("records what the pinned Bedrock Dedicated Server's scripts recorded", async () => {
            const records = new Map<string, ScenarioRecord | undefined>();
            for (const scenario of scenarios) records.set(scenario.id, await runScenarioOnJsp(scenario));

            measureScenarios(family, sourceFile, scenarioGroup([scenarioRecordComparison(scenarios, records)]));
        });
    });
};
