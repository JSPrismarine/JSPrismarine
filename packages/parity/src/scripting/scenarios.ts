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
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Family } from '../families.ts';
import type { Observation } from './record.ts';
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
    /**
     * What JSPrismarine needs to run the scenario. `engine` packs import no module and report
     * only through `console`, so a bare script engine runs them with no world. `world` packs run
     * together in a level, through the script host that loads a level's packs.
     */
    readonly needs: 'engine' | 'world';
    /**
     * `server.properties` values the scenario's server runs with, under their BDS names. The
     * capture writes them for BDS, and JSPrismarine's runner reads the ones its script host
     * knows, such as the `script-watchdog-*` keys.
     */
    readonly properties?: Readonly<Record<string, string>>;
    /**
     * The packs BDS refuses to load. A refused pack runs no line, so it records nothing and
     * writes no end line, and the capture does not wait for one.
     */
    readonly refused?: readonly string[];
    /** How many times each pack ends its record: 1, or once per run for a scenario that reloads. */
    readonly runs?: number;
    /**
     * An event whose observation makes the runner send `/reload` once, on BDS's console and to
     * JSPrismarine's scripts, for a scenario about what a reload does.
     */
    readonly reloadAfter?: string;
    /**
     * Observations JSPrismarine makes differently from BDS on purpose, by event: what JSPrismarine
     * records instead of the golden's value or error, and the decision that makes it differ.
     */
    readonly jsprismarineDiffers?: Readonly<
        Record<string, { readonly observed: Pick<Observation, 'value' | 'error'>; readonly because: string }>
    >;
}

/** The directory the scenario packs live in. */
export const SCENARIO_DIRECTORY = join(import.meta.dirname, '..', '..', 'scenarios');

/**
 * The scenario's `config/` folder, in BDS's layout, when it has one: a folder per script module
 * UUID that the capture copies into the server's `config/` and JSPrismarine's runner reads.
 */
export const scenarioConfigDirectory = (scenario: ScriptScenario): string | undefined => {
    const directory = join(SCENARIO_DIRECTORY, scenario.id, 'config');
    return existsSync(directory) ? directory : undefined;
};

/** The packs of a scenario that load, and so have to write their end line. */
export const loadedPacks = (scenario: ScriptScenario): readonly string[] =>
    scenario.packs.filter((pack) => !(scenario.refused ?? []).includes(pack));

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
        packs: ['v2', 'v1'],
        needs: 'world'
    },
    {
        id: 'globals',
        family: 'scripting.engine',
        description:
            "A script's global object holds the names BDS's QuickJS defines plus the host's console and print, each " +
            'built-in has only the members that QuickJS release has, and eval, Function from a string, the regular ' +
            'expression v flag and unbounded recursion fail with fixed errors.',
        reference: 'docs/research/bedrock-script-api.md section 1',
        packs: ['engine'],
        needs: 'engine'
    },
    {
        id: 'system-tasks',
        family: 'scripting.lifecycle',
        description:
            'system.run, runTimeout and runInterval callbacks run in the script flush of the tick they are due, in the ' +
            'order they were queued, each followed by the promise jobs it queued; a system.run queued by a running task ' +
            'waits for the next tick while a runTimeout of 0 does not, and a cleared run never runs.',
        reference: 'docs/research/bedrock-script-api.md section 5',
        packs: ['tasks'],
        needs: 'world'
    },
    {
        id: 'module-resolution',
        family: 'scripting.lifecycle',
        description:
            'A pack gets the newest stable minor of each major version it declares, a relative import loads from the ' +
            'pack, and a dynamic import of a module the manifest does not declare rejects.',
        reference: 'docs/research/bedrock-script-api.md section 4',
        packs: ['v2', 'v1'],
        needs: 'world',
        jsprismarineDiffers: {
            'import @jsprismarine/server': {
                observed: { value: 'resolved' },
                because:
                    'ADR 0020: JSPrismarine resolves an undeclared @jsprismarine/server, so a pack can detect it and fall back on BDS'
            }
        }
    },
    {
        id: 'contexts',
        family: 'scripting.engine',
        description:
            "Each pack runs in a context of its own, so one pack's globals and built-ins are not another's, and " +
            'Math.random and Date give a script a number in range and the current date.',
        reference: 'docs/plans/script-api-host.md slice 6',
        packs: ['first', 'second'],
        needs: 'world'
    },
    {
        id: 'argument-errors',
        family: 'scripting.engine',
        description:
            'A member checks its arguments against the metadata before it runs, and throws a fixed TypeError, ' +
            'ArgumentOutOfBoundsError or ReferenceError for a wrong type, a wrong count, a value out of bounds and a ' +
            'class with no constructor.',
        reference: 'docs/plans/script-api-host.md slice 4',
        packs: ['args'],
        needs: 'world'
    },
    {
        id: 'watchdog',
        family: 'scripting.engine',
        description:
            'A callback that never returns is stopped without running its catch or finally block, a caught stack ' +
            'overflow reaches the script, and with watchdog shutdown off the pack keeps running.',
        reference: 'docs/research/bedrock-script-api.md section 7',
        packs: ['spin'],
        needs: 'world',
        properties: {
            'script-watchdog-enable-shutdown': 'false',
            'script-watchdog-hang-threshold': '500'
        }
    },
    {
        id: 'weather-events',
        family: 'scripting.events',
        description:
            'Dimension.setWeather raises weatherChange as a before-event a script can cancel, in restricted execution, ' +
            'and as an after-event in the script flush, and world.sendMessage works in both.',
        reference: 'docs/plans/script-api-host.md slice 6',
        packs: ['weather'],
        needs: 'world'
    },
    {
        id: 'privileges',
        family: 'scripting.lifecycle',
        description:
            "A member that does not list early execution among its privileges throws a fixed ReferenceError at a version 2 pack's " +
            'top level and in startup, and works once the world has loaded.',
        reference: 'docs/research/bedrock-script-api.md section 5',
        packs: ['early'],
        needs: 'world'
    },
    {
        id: 'config-permissions',
        family: 'scripting.lifecycle',
        description:
            'A pack loads only when config/<script module uuid>/permissions.json, or config/default/permissions.json when ' +
            'the pack has no folder, allows every module it declares: a folder can allow a module the default does not, ' +
            'and refuse one it does.',
        reference: 'docs/research/bedrock-script-api.md section 6',
        packs: ['widened', 'narrowed', 'unconfigured', 'control'],
        refused: ['narrowed', 'unconfigured'],
        needs: 'world'
    },
    {
        id: 'reload',
        family: 'scripting.lifecycle',
        description:
            '/reload sends system.beforeEvents.shutdown, then runs every pack again from its top level, with startup and ' +
            'worldLoad, while system.currentTick carries on and the tasks queued before it are dropped.',
        reference: 'docs/research/bedrock-script-api.md section 5',
        packs: ['reloaded'],
        runs: 2,
        reloadAfter: 'ready for /reload',
        needs: 'world'
    }
];
