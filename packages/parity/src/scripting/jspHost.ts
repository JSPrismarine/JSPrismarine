/**
 * The JSPrismarine side of a scripting scenario.
 *
 * This is the seam the script host plugs into. It takes a scenario, loads its packs into a world
 * the way BDS would, runs that world until every pack has written its end line, and returns what
 * the scripts recorded, in the same format the BDS capture reads off the content log.
 */
import type { ScenarioRecord } from './record.ts';
import type { ScriptScenario } from './scenarios.ts';

/**
 * Runs a scenario's packs on JSPrismarine and returns their record.
 *
 * JSPrismarine has no script host yet, so this returns undefined and every scenario row reads as
 * deferred. The script host skeleton, issue #3203, replaces the body.
 *
 * @returns The record, or undefined while JSPrismarine cannot run behavior pack scripts.
 */
export const runScenarioOnJsp = async (_scenario: ScriptScenario): Promise<ScenarioRecord | undefined> => undefined;
