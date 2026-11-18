import { NativeLibraryError } from '@jsprismarine/errors/script-host';
import { expect, it } from 'vitest';

import { scriptHostAvailable } from '../../../script-host/src/testing/library.test.helper.ts';
import type { BehaviorScenario } from '../behaviorScenarios.ts';
import { measureScenarios, scenarioGroup } from '../behaviorScenarios.ts';
import { describeFamily } from '../measure.ts';
import type { ReferenceSource } from '../references.ts';
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

/** What starts a row's difference when JSPrismarine differs from BDS only where it means to. */
const INTENTIONAL = 'JSPrismarine differs from BDS on purpose at ';

/** What running a scenario on JSPrismarine gave: a record, nothing yet, or the error it threw. */
export type ScenarioOutcome = ScenarioRecord | undefined | { readonly failed: unknown };

/**
 * Runs a scenario on JSPrismarine, keeping what it throws so the scenario still gets a row. A
 * missing script host library is not the scenario's fault, and still fails the test.
 */
export const runScenarioOutcome = async (scenario: ScriptScenario): Promise<ScenarioOutcome> => {
    try {
        return await runScenarioOnJsp(scenario);
    } catch (error) {
        if (error instanceof NativeLibraryError) throw error;
        return { failed: error };
    }
};

/**
 * The comparison behind every scripting row: JSPrismarine's record of a scenario against the
 * golden the pinned Bedrock Dedicated Server produced.
 *
 * @param records - What running each scenario on JSPrismarine gave, by id: its record,
 *   undefined while it has no script host, or the error it threw. The records are taken before the rows run, because the host is asynchronous
 *   and a row is not.
 */
export const scenarioRecordComparison = (
    scenarios: readonly ScriptScenario[],
    records: ReadonlyMap<string, ScenarioOutcome>
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
        if ('failed' in record) return `JSPrismarine threw while running the scenario: ${String(record.failed)}`;
        const unexpected = diffScenarioRecords(expectedOnJsp(golden, scenario), record);
        if (unexpected !== undefined) return unexpected;
        const intended = intendedDifferences(golden, scenario);
        return intended.length === 0 ? undefined : `${INTENTIONAL}${intended.map(([event]) => event).join(', ')}`;
    },
    classify: (scenario, difference) => {
        if (difference === NO_SCRIPT_HOST) {
            return {
                kind: 'deferred',
                reason: `JSPrismarine cannot run behavior pack scripts yet. On BDS: ${scenario.description}`,
                reference: SCRIPT_HOST_ISSUE
            };
        }
        const intended = difference.startsWith(INTENTIONAL) ? intendedDifferences(readGolden(scenario), scenario) : [];
        if (intended.length > 0) {
            return {
                kind: 'intentional',
                reason: intended.map(([event, { because }]) => `${event}: ${because}.`).join(' '),
                reference: [...new Set(intended.map(([, { reference }]) => reference))].join(', ')
            };
        }
        return {
            kind: 'defect',
            reason: `${scenario.description} Observed: ${difference}.`,
            reference: scenario.reference
        };
    }
});

const readGolden = (scenario: ScriptScenario): ScenarioRecord =>
    readScenarioGolden(scenario.id) ?? { observations: [] };

/** The differences a scenario declares that its golden has an observation for, in the golden's order. */
const intendedDifferences = (golden: ScenarioRecord, scenario: ScriptScenario) => {
    const differs = scenario.jsprismarineDiffers ?? {};
    return [...new Set(golden.observations.map((observation) => observation.event))].flatMap((event) => {
        const declared = differs[event];
        return declared === undefined ? [] : [[event, declared] as const];
    });
};

/**
 * The record JSPrismarine should make: the golden, with each observation the scenario says
 * JSPrismarine makes differently on purpose replaced by what it makes instead.
 */
export const expectedOnJsp = (golden: ScenarioRecord, scenario: ScriptScenario): ScenarioRecord => {
    const differs = scenario.jsprismarineDiffers;
    if (differs === undefined) return golden;
    return {
        ...golden,
        observations: golden.observations.map((observation) => {
            const instead = differs[observation.event];
            if (instead === undefined) return observation;
            const { value: _value, error: _error, ...rest } = observation;
            return { ...rest, ...instead.observed };
        })
    };
};

/**
 * The references a scripting family needs before its rows run. A family that declares scenarios
 * needs none, because its rows report a scenario without a golden as a defect, and skipping the
 * family as "not measured" would hide that. A family with no scenario needs a golden to exist.
 *
 * @param family - The family.
 * @param scenarios - The scenarios the family declares.
 * @returns The references to check, empty when the rows report missing goldens themselves.
 */
export const scriptingFamilyReferences = (
    family: ScriptingFamily,
    scenarios: readonly ScriptScenario[]
): ReferenceSource[] => (scenarios.length === 0 ? [scriptingGoldens(family)] : []);

/**
 * Declares one scripting family's tests: a row per scenario of the family, each comparing
 * JSPrismarine's record with the BDS golden.
 *
 * A family with no declared scenario reports "not measured"; a declared scenario with no golden
 * fails its row. Rows that differ are checked against `goldens/behavior-gaps.json`, and `PARITY_UPDATE_BEHAVIOR_GAPS=1` rewrites the family's
 * baseline from what they observed. A family with a scenario skips where no script host library
 * is built, unless `JSP_SCRIPT_HOST_REQUIRE=1` asks for it.
 * @param family - The family, which is also the describe title the dashboard groups by.
 * @param sourceFile - The test file, for the tracker's source link.
 */
export const describeScriptingFamily = (family: ScriptingFamily, sourceFile: string): void => {
    const scenarios = SCRIPT_SCENARIOS.filter((scenario) => scenario.family === family);
    // Every scenario runs in the script host, a bare engine or a level's.
    const needsLibrary = scenarios.length > 0;
    // A server scenario boots a whole server, whose vanilla entities come from the pinned Bedrock
    // Dedicated Server's pack. Without it a pack's spawnEntity('minecraft:armor_stand') throws, so
    // the family runs where that data is.
    const needsRealData = scenarios.some((scenario) => scenario.needs === 'server');

    describeFamily(family, scriptingFamilyReferences(family, scenarios), () => {
        // A missing golden's row matches the scenario's allow-list entry by id, which would let it
        // pass, so a test that needs no script host library checks every scenario has its golden.
        it('has a BDS golden for every declared scenario', () => {
            const missing = scenarios.filter((scenario) => readScenarioGolden(scenario.id) === undefined);
            expect(missing.map((scenario) => scenario.id)).toEqual([]);
        });

        it.skipIf(needsLibrary && !scriptHostAvailable())(
            "records what the pinned Bedrock Dedicated Server's scripts recorded",
            // A server scenario boots a whole server, whose content build takes most of it, and the
            // family runs its scenarios one after another, so its budget grows with them.
            { timeout: Math.max(300_000, 150_000 * scenarios.length), tags: needsRealData ? ['real-data'] : [] },
            async () => {
                const records = new Map<string, ScenarioOutcome>();
                for (const scenario of scenarios) records.set(scenario.id, await runScenarioOutcome(scenario));

                measureScenarios(family, sourceFile, scenarioGroup([scenarioRecordComparison(scenarios, records)]));
            }
        );
    });
};
