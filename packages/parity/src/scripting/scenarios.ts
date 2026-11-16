/**
 * The scripting scenarios: small behavior packs whose scripts record what they observe.
 *
 * A scenario's packs live in `packages/parity/scenarios/<id>/<pack>/`, each a complete behavior
 * pack with its own `manifest.json`, so the same directories load on the pinned Bedrock Dedicated
 * Server and, once it has a script host, on JSPrismarine. `scripts/capture-scripting.ts` runs them
 * on BDS and checks the record in as a golden; `describeScriptingFamily` compares JSPrismarine's
 * record with it.
 *
 * This module imports nothing beyond node and relative paths, so the capture script runs it
 * under plain node.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Family } from '../families.ts';
import { isRecord } from '../isRecord.ts';

/** A family of the `scripting` group. */
export type ScriptingFamily = Extract<Family, `scripting.${string}`>;

/** One scenario: packs that run together in one world, and what their record shows. */
export interface ScriptScenario {
    /** The scenario id: its directory under `scenarios/` and its golden's file name. */
    readonly id: string;
    readonly family: ScriptingFamily;
    /** What the record shows about BDS, in one sentence. */
    readonly description: string;
    /** Where the behavior was first observed or is documented. */
    readonly reference: string;
    /** The pack directory names, in the order the world lists them. */
    readonly packs: readonly string[];
}

/** The directory the scenario packs live in. */
export const SCENARIO_DIRECTORY = join(import.meta.dirname, '..', '..', 'scenarios');

/** Where one of a scenario's packs is. */
export const scenarioPackDirectory = (scenario: ScriptScenario, pack: string): string =>
    join(SCENARIO_DIRECTORY, scenario.id, pack);

/** A pack's identity as its manifest header gives it, which is what a world enables it by. */
export interface ScenarioPackIdentity {
    readonly uuid: string;
    readonly version: readonly number[];
}

/**
 * Reads a scenario pack's header UUID and version from its manifest.
 *
 * @throws Error when the manifest has no header UUID or no `[major, minor, patch]` version.
 */
export const readScenarioPackIdentity = (directory: string): ScenarioPackIdentity => {
    const path = join(directory, 'manifest.json');
    const manifest: unknown = JSON.parse(readFileSync(path, 'utf8'));
    const header = isRecord(manifest) ? manifest.header : undefined;
    if (!isRecord(header) || typeof header.uuid !== 'string') throw new Error(`${path} has no header uuid.`);
    const { version } = header;
    if (!Array.isArray(version) || version.length !== 3 || !version.every(Number.isInteger)) {
        throw new Error(`${path} has no [major, minor, patch] header version.`);
    }
    return { uuid: header.uuid, version: version.map(Number) };
};

/** Every scripting scenario, in the order the capture runs them. */
export const SCRIPT_SCENARIOS: readonly ScriptScenario[] = [
    {
        id: 'startup-order',
        family: 'scripting.lifecycle',
        description:
            "A version 2 pack's top level, its top-level promise jobs and startup run in early execution before a " +
            'version 1 pack starts; system tasks, worldInitialize and worldLoad then follow in a fixed order in tick 0, ' +
            'and a version 1 promise job queued in worldInitialize waits for tick 1.',
        reference: 'docs/research/bedrock-script-api.md section 5',
        packs: ['v2', 'v1']
    }
];
