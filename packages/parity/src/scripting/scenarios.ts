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
import type { ScenarioClient } from './formClient.ts';
import type { Observation, ScenarioRecord } from './record.ts';
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
     * together in a level, through the script host that loads a level's packs. `server` packs
     * read entities, blocks, items or commands, so they run in a headless server with a flat
     * world, as a server runs them.
     */
    readonly needs: 'engine' | 'world' | 'server';
    /**
     * `server.properties` values the scenario's server runs with, under their BDS names. The
     * capture writes them for BDS, and JSPrismarine's runner reads the ones its script host
     * knows, such as the `script-watchdog-*` keys.
     */
    readonly properties?: Readonly<Record<string, string>>;
    /**
     * The world experiments the scenario's world has on, by their `level.dat` names, such as
     * `gametest` for Beta APIs. The capture writes them into the staged world's `level.dat`, and
     * JSPrismarine's runner turns on the ones its script host reads.
     */
    readonly experiments?: readonly string[];
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
     * An event a task the pack queued before the reload records when it runs. The reload drops
     * that task, so a capture whose record holds the event sent the reload too late to show it,
     * and {@link checkReloadLanded} rejects it.
     */
    readonly reloadDrops?: string;
    /**
     * The `/gametest` commands the runner sends on the console once a pack records the event,
     * such as `gametest run jsp:chat`, for a scenario about GameTests or one that needs a
     * player: a test can spawn a simulated player, and the capture has no client. JSPrismarine's
     * runner sends them to a server scenario's console between two ticks.
     */
    readonly gametestAfter?: { readonly event: string; readonly commands: readonly string[] };
    /**
     * Commands the runner types on the server's console, in order, once a pack records the event:
     * on BDS's console in the capture, and through JSPrismarine's console sender in its runner.
     */
    readonly consoleAfter?: { readonly event: string; readonly commands: readonly string[] };
    /**
     * A client that joins the scenario's server and answers the forms its scripts show. The BDS
     * capture connects a headless client once the server is ready, and JSPrismarine's runner
     * gives the level a player that answers at the world seam. Both record the form packets the
     * client received.
     */
    readonly client?: ScenarioClient;
    /**
     * Observations JSPrismarine makes differently from BDS on purpose, by event: what JSPrismarine
     * records instead of the golden's value or error, why, and the decision record that says so.
     * The scenario's row reports each as an intentional difference.
     */
    readonly jsprismarineDiffers?: Readonly<
        Record<
            string,
            {
                readonly observed: Pick<Observation, 'value' | 'error'>;
                readonly because: string;
                readonly reference: string;
            }
        >
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

/**
 * Rejects a reload scenario's record when the task the reload should drop ran first: the reload
 * landed after that task was due, so the record would not show what a reload drops.
 * @throws {Error} When the record holds the scenario's {@link ScriptScenario.reloadDrops} event.
 */
export const checkReloadLanded = (scenario: ScriptScenario, record: ScenarioRecord): void => {
    const dropped = scenario.reloadDrops;
    if (dropped === undefined) return;
    const ran = record.observations.find((observation) => observation.event === dropped);
    if (ran !== undefined) {
        throw new Error(
            `The ${scenario.id} capture recorded "${dropped}" at tick ${ran.tick}, so the reload landed too late. Run it again.`
        );
    }
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
                    'JSPrismarine resolves an undeclared @jsprismarine/server, so a pack can detect it and fall back on BDS',
                reference: 'docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md'
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
        reloadDrops: 'a task queued before the reload',
        needs: 'world'
    },
    {
        id: 'beta-versions',
        family: 'scripting.lifecycle',
        description:
            'With the Beta APIs experiment on, a pack gets a beta module version only when it is the one beta BDS ships, ' +
            'which the version word beta also names; any other version, beta or stable, gets no context, and the ' +
            'content log names the version asked for.',
        reference: 'docs/research/bedrock-script-api.md section 2',
        packs: ['shipped', 'word', 'others', 'newer', 'older', 'unshipped', 'v1beta'],
        refused: ['newer', 'older', 'unshipped', 'v1beta'],
        experiments: ['gametest'],
        needs: 'world'
    },
    {
        id: 'beta-experiment-off',
        family: 'scripting.lifecycle',
        description:
            'Without the Beta APIs experiment, a pack that declares a beta version of any module does not load, whether ' +
            'BDS ships that version or not, and the content log names the experiment.',
        reference: 'docs/research/bedrock-script-api.md section 2',
        packs: ['shipped', 'newer', 'word', 'ui-beta', 'control'],
        refused: ['shipped', 'newer', 'word', 'ui-beta'],
        needs: 'world'
    },
    {
        id: 'watchdog-terminate',
        family: 'scripting.events',
        description:
            'With watchdog shutdown on, a hang and a caught stack overflow each raise system.beforeEvents.watchdogTerminate ' +
            'with their reason, and a script that cancels it keeps the server and the pack running.',
        reference: 'docs/plans/script-api-host.md slice 9',
        packs: ['terminate'],
        experiments: ['gametest'],
        properties: { 'script-watchdog-hang-threshold': '500' },
        needs: 'world'
    },
    {
        id: 'chat-send',
        family: 'scripting.events',
        description:
            "A player's chat raises world.beforeEvents.chatSend while the line is sent, with its message and its sender, " +
            'and a cancel there stops the line, so only the other one reaches world.afterEvents.chatSend in the flush.',
        reference: 'docs/plans/script-api-host.md slice 9',
        packs: ['chat'],
        experiments: ['gametest'],
        gametestAfter: { event: 'ready for /gametest', commands: ['gametest run jsp:chat'] },
        needs: 'server'
    },
    {
        id: 'forms',
        family: 'scripting.ui',
        description:
            'ActionFormData, ModalFormData and MessageFormData each send the client one form whose JSON is fixed by the ' +
            'builder calls, and show() settles with the response the client sends, a cancel with its reason, or a ' +
            'rejection when the answer does not fit the form or the player leaves.',
        reference: 'docs/plans/script-api-host.md slice 13',
        packs: ['ui'],
        needs: 'world',
        client: {
            answers: [
                { response: '2' },
                { cancel: 'UserClosed' },
                { response: '[null,null,null,"typed",1,6,false]' },
                { cancel: 'UserBusy' },
                { response: '["",0,1.5,true]' },
                { response: 'true' },
                { response: 'false' },
                { cancel: 'UserClosed' },
                { response: '5' },
                { response: '"oops"' },
                { response: '[true,"x"]' },
                { response: 'null' },
                { ignore: true },
                { leave: true }
            ]
        }
    },
    {
        id: 'form-json',
        family: 'scripting.ui',
        description:
            'A form is JSON with its keys in order and a newline at the end, its strings escaped only where JSON needs it, ' +
            'its slider numbers written in a fixed float format, and a RawMessage title, label or button written as a ' +
            'rawtext list, whose with list becomes a rawtext of its own.',
        reference: 'docs/plans/script-api-host.md slice 13',
        packs: ['json'],
        needs: 'world',
        client: {
            answers: Array.from({ length: 29 }, () => ({ cancel: 'UserClosed' }) as const)
        }
    },
    {
        id: 'form-responses',
        family: 'scripting.ui',
        description:
            'show() settles with whatever JSON value the client sends when its type fits the form, rejects with ' +
            'MalformedResponse when it does not, and reads a response with no JSON as canceled, whatever its reason byte.',
        reference: 'docs/plans/script-api-host.md slice 13',
        packs: ['responses'],
        needs: 'world',
        client: {
            answers: [
                { response: '"1"' },
                { response: '1.7' },
                { response: '1.0' },
                { response: '-1' },
                { response: 'true' },
                { response: '[0]' },
                { response: '4294967296' },
                { response: ' 1\n' },
                { response: '[]' },
                { response: '[true,"a",3]' },
                { response: '{}' },
                { response: '[null,null]' },
                { response: '[[1],{"a":1}]' },
                { response: '7' },
                { response: '1' },
                { response: '"true"' },
                { response: 'null' },
                { response: '0' },
                { cancel: 2 },
                {},
                { response: '0', cancel: 'UserBusy' },
                { response: '' },
                { response: '[1' }
            ]
        }
    },
    {
        id: 'forms-v1',
        family: 'scripting.ui',
        description:
            'The version 1 signatures of ModalFormData take a default and a slider step as plain arguments and write the ' +
            'same form JSON as the version 2 options objects, and a version 1 ModalFormResponse reads null as undefined.',
        reference: 'docs/plans/script-api-host.md slice 13',
        packs: ['v1'],
        needs: 'world',
        client: {
            answers: [
                { response: '["typed",0,6,1.5,false]' },
                { response: '0' },
                { response: 'false' },
                { response: 'true' },
                { cancel: 'UserBusy' },
                { response: '[null,null]' }
            ]
        }
    },
    {
        id: 'world-basics',
        family: 'scripting.world',
        description:
            'With no player, world.getAllPlayers and getPlayers are empty, getDimension takes a name with or without ' +
            'its namespace and returns one object per dimension, and Dimension.runCommand returns a success count, ' +
            'throws for a command that fails, and raises system.afterEvents.scriptEventReceive for /scriptevent.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['world'],
        needs: 'server'
    },
    {
        id: 'entities',
        family: 'scripting.entities',
        description:
            'An entity a script spawns reports its type, location, dimension, name tag and tags, moves on teleport, ' +
            'lists its inventory through getComponent, is found by getEntities, and once killed reports isValid false ' +
            'and throws from its other members.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['entities'],
        needs: 'server'
    },
    {
        id: 'blocks',
        family: 'scripting.blocks',
        description:
            'Dimension.getBlock returns a block with its type, location, dimension and permutation, undefined in an ' +
            'unloaded chunk, and Block.setType, setPermutation and BlockPermutation.resolve change and describe ' +
            'blocks, with fixed errors for an unknown type or state.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['blocks'],
        needs: 'server'
    },
    {
        id: 'items',
        family: 'scripting.items',
        description:
            'new ItemStack makes a stack of a type and an amount, with a namespace added when left out and fixed ' +
            'errors for an unknown type or an amount out of range, and its amount, name tag and lore read back what ' +
            'a script wrote.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['items'],
        needs: 'server'
    },
    {
        id: 'players',
        family: 'scripting.entities',
        description:
            'A player raises playerJoin, playerSpawn and both playerLeave events, and its name, tags, inventory, ' +
            'teleport and runCommand behave as they do for any entity, while world.getPlayers finds it by name.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['players'],
        experiments: ['gametest'],
        gametestAfter: { event: 'ready for /gametest', commands: ['gametest run jsp:players'] },
        needs: 'server'
    },
    {
        id: 'gametest',
        family: 'scripting.gametest',
        description:
            "GameTests registered at a pack's top level run with /gametest runset: each test function runs once, " +
            'succeed, fail, a failed assert, a throw and maxTicks end a test, and runAfterDelay, succeedWhen and idle ' +
            'run on the ticks the runner counts from the start of the test.',
        reference: 'docs/plans/script-api-host.md slice 14',
        packs: ['lifecycle'],
        experiments: ['gametest'],
        gametestAfter: { event: 'ready for /gametest', commands: ['gametest runset jsp'] },
        needs: 'server'
    },
    {
        id: 'persistence',
        family: 'scripting.world',
        description:
            'The world, an entity and an unstackable item stack each keep dynamic properties by pack, with fixed ' +
            'errors for a value no property holds or a string too long, and the script scoreboard and /scoreboard ' +
            'share one set of objectives, scores and display slots.',
        reference: 'docs/plans/script-api-host.md slice 12',
        packs: ['persistence'],
        needs: 'server'
    },
    {
        id: 'custom-commands',
        family: 'scripting.commands',
        description:
            'customCommandRegistry.registerCommand and registerEnum in startup add namespaced commands that a script and ' +
            'the console run, with fixed errors for a name or enum BDS refuses; a callback receives each parameter as ' +
            'its type and the origin of the run, runs in restricted execution, and its result reaches the sender.',
        reference: 'docs/plans/script-api-host.md slice 11',
        packs: ['commands'],
        consoleAfter: {
            event: 'ready for the console',
            commands: ['jsp:hello', 'jsp:fail', 'jsp:types word 7 2.5 true 1 2 3 red', 'hello', 'jsp:throws']
        },
        needs: 'server'
    },
    {
        id: 'custom-command-errors',
        family: 'scripting.commands',
        description:
            "A script's runCommand throws a fixed syntax error for a custom command whose argument does not parse, " +
            'for a name BDS dropped because it has an upper-case letter, and for one registered after startup.',
        reference: 'docs/plans/script-api-host.md slice 11',
        packs: ['errors'],
        needs: 'server'
    },
    {
        id: 'custom-components',
        family: 'scripting.components',
        description:
            'blockComponentRegistry and itemComponentRegistry register namespaced components in startup, with fixed ' +
            "errors for a name BDS refuses, and a pack's block runs the hooks of the components it names, with their " +
            'parameters, when a script or a command places it, its tick comes round and it is removed.',
        reference: 'docs/plans/script-api-host.md slice 11',
        packs: ['components'],
        needs: 'server'
    }
];
