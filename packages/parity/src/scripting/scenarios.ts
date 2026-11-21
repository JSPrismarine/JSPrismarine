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
import type { Observation, ObservedValue, ScenarioRecord } from './record.ts';
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
     * Whether the runner starts the local HTTP server the scenario's `server-net` requests go
     * to (`httpServer.ts`), on the address the `base` variable of its `variables.json` names,
     * before the server starts and until it stops.
     */
    readonly httpServer?: boolean;
    /**
     * Observations JSPrismarine makes differently from BDS on purpose, by event: what JSPrismarine
     * records instead of the golden's value or error, or the fields of the golden's object value it
     * records differently, why, and the decision record that says so. The scenario's row reports
     * each as an intentional difference.
     */
    readonly jsprismarineDiffers?: Readonly<
        Record<
            string,
            (
                | { readonly observed: Pick<Observation, 'value' | 'error'> }
                | { readonly fields: Readonly<Record<string, ObservedValue>> }
            ) & {
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
        id: 'jsp-detect',
        family: 'scripting.lifecycle',
        description:
            'A pack that leaves @jsprismarine/server out of its manifest and imports it with import() inside try ' +
            'loads on both servers: the import rejects and the pack takes its fallback where the module does not ' +
            'exist, and a file that imports the module statically fails to load there too.',
        reference: 'docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md',
        packs: ['detect'],
        needs: 'world',
        jsprismarineDiffers: {
            'import @jsprismarine/server': {
                observed: { value: 'resolved' },
                because: 'JSPrismarine resolves an undeclared @jsprismarine/server',
                reference: 'docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md'
            },
            server: {
                observed: {
                    value: {
                        exports: [
                            'bossBars',
                            'config',
                            'getPing',
                            'jsprismarine',
                            'performance',
                            'permissions',
                            'playerList'
                        ],
                        name: 'JSPrismarine',
                        version: 'string',
                        minecraftVersion: 'string',
                        protocolVersion: 'number',
                        maxPlayers: 'number',
                        frozen: true,
                        performance: {
                            averageTickMs: 'number',
                            lastTickMs: 'number',
                            tps: 'number',
                            tpsAverages: 'object'
                        },
                        getPing: 'function',
                        bossBars: { show: 'function' },
                        playerList: { reset: 'function', setDisplayName: 'function' },
                        placeholders: {
                            namespaces: 'function',
                            parse: 'function',
                            register: 'function',
                            render: 'function',
                            resolve: 'function'
                        },
                        config: { afterEvents: 'object', value: 'undefined', write: 'function' },
                        permissions: {
                            addToGroup: 'function',
                            afterEvents: 'object',
                            grant: 'function',
                            grantToGroup: 'function',
                            groupsOf: 'function',
                            has: 'function',
                            metaOf: 'function',
                            primaryGroupOf: 'function',
                            removeFromGroup: 'function',
                            revoke: 'function',
                            revokeFromGroup: 'function'
                        },
                        allFrozen: true
                    }
                },
                because:
                    'a pack that gets @jsprismarine/server uses it, its performance, getPing, bossBars, playerList, ' +
                    'config and permissions included, and @jsprismarine/placeholders beside it, and takes the fallback only ' +
                    'where the import rejects',
                reference: 'docs/guide/jsprismarine-module.md'
            },
            'import ./static.js': {
                observed: { value: 'JSPrismarine' },
                because: 'modules under @jsprismarine/ need no manifest entry, so a static import of one resolves',
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
        id: 'player-client-feedback',
        family: 'scripting.entities',
        description:
            "Player's music, client messages and Camera.playAnimation take their calls for the joined client, refuse " +
            'a negative fade, a spline with too few control points and key frames that do not start at time 0, and ' +
            "read back no spline's control points.",
        reference: 'https://github.com/JSPrismarine/JSPrismarine/issues/3308',
        packs: ['client'],
        experiments: ['gametest'],
        needs: 'world',
        client: { answers: [] }
    },
    {
        id: 'input-permission-events',
        family: 'scripting.events',
        description:
            'Player.inputPermissions.setPermissionCategory raises world.afterEvents.playerInputPermissionCategoryChange ' +
            'with the category, whether it is enabled and the player.',
        reference: 'https://github.com/JSPrismarine/JSPrismarine/issues/3295',
        packs: ['inputs'],
        experiments: ['gametest'],
        needs: 'world',
        client: { answers: [] }
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
        id: 'entity-members',
        family: 'scripting.entities',
        description:
            'World.getEntity finds an entity by id as the same object, Dimension.getPlayers lists only players, an ' +
            'entity reports its rotation, head location, view direction and sneaking, and Container.addItem fills a ' +
            'chest minecart as a hopper would: onto matching stacks first, then into the first empty slot, handing ' +
            'back what does not fit.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['members'],
        needs: 'server'
    },
    {
        id: 'entity-events',
        family: 'scripting.events',
        description:
            'world.afterEvents.entitySpawn, entityHurt and entityDie report entities a script spawns, summons, hurts ' +
            'with applyDamage and kills, with the cause, the damage and the entity that dealt it.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['events'],
        needs: 'server'
    },
    {
        id: 'script-event-console',
        family: 'scripting.world',
        description:
            '/scriptevent typed on the server console raises system.afterEvents.scriptEventReceive with the source ' +
            'type Server and no source entity, block or initiator, and an id in the minecraft namespace raises nothing.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['console'],
        consoleAfter: {
            event: 'ready for the console',
            commands: [
                'scriptevent jsp:first hello there',
                'scriptevent minecraft:refused nothing',
                'scriptevent jsp:empty',
                'scriptevent jsp:last  two  spaces '
            ]
        },
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
        id: 'block-volumes',
        family: 'scripting.blocks',
        description:
            'BlockBoundingBoxUtils works on boxes of whole blocks, and BlockVolume and ListBlockVolume give their ' +
            'bounds, capacity, closest and farthest locations and an iterator that turns invalid once its volume ' +
            'changes.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['volumes'],
        experiments: ['gametest'],
        needs: 'world'
    },
    {
        id: 'block-members',
        family: 'scripting.blocks',
        description:
            "A block reaches its neighbors and answers its type's tags, localization key, item, liquid answers and " +
            'light, a permutation matches states and takes a new value with withState, and BlockTypes and ' +
            'BlockStates list the registries.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['members'],
        experiments: ['gametest'],
        needs: 'server',
        jsprismarineDiffers: {
            getLightLevel: {
                observed: { value: [0, 15, 0, 15] },
                because:
                    'A chunk only a ticking area loads is lit as Java lights a force-loaded chunk, where BDS ' +
                    'answers 0 for every block in it',
                reference: 'packages/lighting/src and issue #3298'
            },
            getSkyLightLevel: {
                observed: { value: [0, 15, 0] },
                because: 'The same light, read as sky light',
                reference: 'packages/lighting/src and issue #3298'
            },
            'torch getLightLevel': {
                observed: { value: [15, 15] },
                because: "The same light, around a torch's own block light",
                reference: 'packages/lighting/src and issue #3298'
            }
        }
    },
    {
        id: 'item-members',
        family: 'scripting.items',
        description:
            "An item stack answers its type's tags, weight, stack size and components, keeps what it can break and " +
            'be placed on, its lock and its enchantments, and ItemTypes, EnchantmentTypes and Potions list the ' +
            'registries.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['members'],
        experiments: ['gametest'],
        needs: 'server'
    },
    {
        id: 'containers',
        family: 'scripting.items',
        description:
            'A container finds, moves, swaps and transfers stacks between chests and weighs what it holds, and a ' +
            "ContainerSlot reads and writes its stack's tags, lock, block lists and dynamic properties.",
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['containers'],
        experiments: ['gametest'],
        needs: 'server'
    },
    {
        id: 'block-world-components',
        family: 'scripting.blocks',
        description:
            "A sign keeps each side's text and dye, a piston reports its state, a jukebox takes and plays a record, " +
            'a cauldron holds a fluid, a redstone block reports its power and a note block its instrument, and a ' +
            'block answers whether another can be placed in it and whether water flows into it.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['components'],
        experiments: ['gametest'],
        needs: 'server'
    },
    {
        id: 'block-liquid-flow',
        family: 'scripting.blocks',
        description:
            'Block.liquidCanFlowFromDirection lets water in from every side, except a slab, stairs, a shelf, a sculk ' +
            'sensor and a heavy core, which close the sides their solid faces cover.',
        reference: 'https://github.com/JSPrismarine/JSPrismarine/issues/3304',
        packs: ['flow'],
        experiments: ['gametest'],
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
    },
    {
        id: 'net-http',
        family: 'scripting.net',
        description:
            'HttpRequest and HttpHeader keep what a script sets, http.get and http.request send it to a local server and ' +
            'settle with its status, headers and body or reject, cancelAll rejects the requests in flight, and a pack ' +
            'that declares @minecraft/server-net without a permissions.json that allows it does not load.',
        reference: 'docs/plans/script-api-host.md slice 15',
        packs: ['http', 'unconfigured'],
        refused: ['unconfigured'],
        experiments: ['gametest'],
        httpServer: true,
        needs: 'world'
    },
    {
        id: 'admin-config',
        family: 'scripting.admin',
        description:
            "variables and secrets read the pack's variables.json and secrets.json, a secret reaches a script only as an " +
            'opaque SecretString, and transferPlayer takes a player and either a hostname and port or a NetherNet id.',
        reference: 'docs/plans/script-api-host.md slice 15',
        packs: ['admin'],
        experiments: ['gametest'],
        gametestAfter: { event: 'ready for /gametest', commands: ['gametest run jsp:transfer'] },
        needs: 'server'
    },
    {
        id: 'debug-shapes',
        family: 'scripting.debug',
        description:
            "Each debug shape class starts with BDS's defaults and keeps what its setters are given, debugDrawer.addShape, " +
            "removeShape, removeAll and a shape's remove decide where it is drawn, and a drawn shape's timeLeft counts " +
            'down by a tick each tick until the drawer drops it.',
        reference: 'docs/plans/script-api-host.md slice 20',
        packs: ['shapes'],
        experiments: ['gametest'],
        needs: 'world'
    },
    {
        id: 'system-jobs',
        family: 'scripting.lifecycle',
        description:
            'system.runJob advances each generator in the script flush of every tick until it ends, alongside the ' +
            'system tasks, clearJob stops a job before or while it runs, and a job that throws ends.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['jobs'],
        needs: 'world'
    },
    {
        id: 'world-events',
        family: 'scripting.events',
        description:
            "The world events a script's own actions raise: effectAdd before and after, with the duration the " +
            'before-event sets, entityHurt before a blow and entityHealthChanged after it, gameRuleChange, ' +
            'and entityRemove before and after.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['events'],
        experiments: ['gametest'],
        needs: 'server'
    },
    {
        id: 'custom-dimensions',
        family: 'scripting.world',
        description:
            "startup's dimensionRegistry.registerCustomDimension adds a void dimension the world then has, with fixed " +
            'errors for a name BDS refuses, a second registration, a registration once startup is over, and a ' +
            'dimension a /reload registers that the first run did not.',
        reference: 'docs/research/data-driven-dimensions.md section 2.3',
        packs: ['dimensions'],
        runs: 2,
        reloadAfter: 'ready for /reload',
        needs: 'world'
    },
    {
        id: 'world-event-gaps',
        family: 'scripting.events',
        description:
            'A script subscribes to the world events whose game systems JSPrismarine lacks, world clocks, pack ' +
            "settings, a sound's end, tripwires, target blocks, input permissions and entity upgrades, and reads " +
            "startup's dimension and world clock registries.",
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['gaps'],
        experiments: ['gametest'],
        needs: 'world'
    },
    {
        id: 'entity-event-options',
        family: 'scripting.events',
        description:
            'An entityHurt or entityDie subscriber that passes EntityEventOptions gets only the events of the entities ' +
            'or the entity types it names, either list matching when both are given.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['options'],
        needs: 'server'
    },
    {
        id: 'block-inventory',
        family: 'scripting.blocks',
        description:
            "A chest's inventory component holds a container a script reads and writes like an entity's, a block " +
            "without one has no component, and an item stack's durability component reads and writes its damage.",
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['chest'],
        needs: 'server'
    },
    {
        id: 'entity-effects',
        family: 'scripting.entities',
        description:
            'Entity.addEffect, getEffect, getEffects and removeEffect add, read and take off status effects, with ' +
            'fixed errors for an unknown effect or a duration out of range, and a MolangVariableMap goes with a particle.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['effects'],
        needs: 'server'
    },
    {
        id: 'player-feedback',
        family: 'scripting.entities',
        description:
            "A player's onScreenDisplay shows titles and an action bar, playSound plays to them, isSneaking can be " +
            'set, and world.beforeEvents.itemUse and playerBreakBlock can cancel a use and a break that their ' +
            'after-events then do not report.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['feedback'],
        experiments: ['gametest'],
        gametestAfter: { event: 'ready for /gametest', commands: ['gametest run jsp:feedback'] },
        needs: 'server'
    },
    {
        id: 'structures',
        family: 'scripting.blocks',
        description:
            'world.structureManager copies a volume of the world into a structure, reads and writes its blocks, ' +
            'places it by id or object, rotated or without its blocks, saves it under another id, lists and deletes ' +
            'structures, and refuses an id in use or one it does not have.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['structures'],
        needs: 'server'
    },
    {
        id: 'entity-components',
        family: 'scripting.entities',
        description:
            "A player's equippable component reads and writes its worn and held stacks, an entity's health and " +
            "movement components read and write the attribute, a container's slots read and write the stack in place, " +
            'and DimensionTypes and EffectTypes list the types the world has.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['components'],
        experiments: ['gametest'],
        gametestAfter: { event: 'ready for /gametest', commands: ['gametest run jsp:components'] },
        needs: 'server'
    },
    {
        id: 'entity-values',
        family: 'scripting.entities',
        description:
            "An entity's components read back what its definition gives it, Entity's members read and move it, and " +
            "Player's members read and write a player's experience, spawn point, permissions, camera, HUD and input.",
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['values'],
        experiments: ['gametest'],
        gametestAfter: { event: 'ready for /gametest', commands: ['gametest run jsp:values'] },
        needs: 'server'
    },
    {
        id: 'entity-attributes',
        family: 'scripting.entities',
        description:
            'A player lists its hunger, saturation and exhaustion components, and an NPC and an armor stand list ' +
            'health and movement, with the values each reads.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['attributes'],
        experiments: ['gametest'],
        gametestAfter: { event: 'ready for /gametest', commands: ['gametest run jsp:attributes'] },
        needs: 'server'
    },
    {
        id: 'dimension-blocks',
        family: 'scripting.blocks',
        description:
            'A dimension sets blocks by type and permutation, finds the block above, below and on top of a ' +
            'location, reads its light and biome, casts rays at blocks and entities, lists the entities at a block, ' +
            'spawns items and experience, makes explosions and refuses unknown features, with fixed errors for a ' +
            'location outside the world or its loaded chunks.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['blocks'],
        experiments: ['gametest'],
        needs: 'server',
        jsprismarineDiffers: {
            'getSkyLightLevel under a one-block roof': {
                observed: { value: 14 },
                because:
                    "JSPrismarine's light follows Java, where sky light reaches the block under a one-block roof " +
                    'from the open sky beside it, one level down, where BDS gives it the full 15',
                reference: 'packages/lighting/src and issue #3311'
            },
            'getLightLevel under glowstone': {
                observed: { value: 14 },
                because:
                    'Glowstone is an opaque block in Java, so the block under it reads its 15 block light one level ' +
                    'down, where BDS lets the sky through it',
                reference: 'packages/lighting/src and issue #3311'
            }
        }
    },
    {
        id: 'ticking-areas',
        family: 'scripting.world',
        description:
            'world.tickingAreaManager makes, finds, lists and removes ticking areas, resolves a new area once its ' +
            'chunks load, refuses an id in use or an area past its capacity, and the /tickingarea command adds and ' +
            "removes areas beside it, whose chunks tick with no player: a pig's effect counts down.",
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['areas'],
        experiments: ['gametest'],
        needs: 'server'
    },
    {
        id: 'primitive-shapes',
        family: 'scripting.debug',
        description:
            "A TextPrimitive starts with BDS's defaults and keeps what its setters are given, and " +
            'world.primitiveShapesManager draws, lists, filters and removes texts.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['text'],
        experiments: ['gametest'],
        needs: 'world'
    },
    {
        id: 'loot-tables',
        family: 'scripting.items',
        description:
            "world.getLootTableManager() reads the behavior pack's loot tables as objects whose pools, entries, " +
            'functions and conditions report the properties of their classes, and generates loot from a table, a ' +
            'block, a block type, a permutation and an entity.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['loot'],
        experiments: ['gametest'],
        needs: 'server'
    },
    {
        id: 'world-clocks',
        family: 'scripting.world',
        description:
            'world.getClock finds a clock whose time, pause and time markers a script reads and writes, the spline ' +
            'classes and Trigger keep what they are given, and world.soundDefinitionRegistry lists sound definitions.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['clocks'],
        experiments: ['gametest'],
        // A real server, since the time of day the clock reads is the level's own.
        needs: 'server'
    },
    {
        id: 'dimension-volumes',
        family: 'scripting.blocks',
        description:
            'A dimension fills a block volume, finds the blocks and biomes it holds, and clones one region of blocks ' +
            'to another, copying or moving them and keeping only the blocks a filter names.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['volumes'],
        experiments: ['gametest'],
        needs: 'server'
    },
    {
        id: 'world-pending',
        family: 'scripting.world',
        description:
            "The world members JSPrismarine has no system for yet answer as on BDS: a dimension's points of " +
            "interest, a playing sound's controls, a pack's features and structures, and jigsaw placement.",
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['pending'],
        experiments: ['gametest'],
        needs: 'server'
    },
    {
        id: 'world-settings',
        family: 'scripting.world',
        description:
            "The world's time of day, day and moon phase follow setTimeOfDay and setAbsoluteTime, its default spawn, " +
            'difficulty and every game rule read back what a script or a command wrote, and system.sendScriptEvent ' +
            'and waitTicks raise and resolve on the ticks BDS uses.',
        reference: 'docs/plans/script-api-host.md slice 10',
        packs: ['settings'],
        experiments: ['gametest'],
        needs: 'server',
        jsprismarineDiffers: {
            'game rule defaults': {
                fields: { spawnRadius: 10, tntExplosionDropDecay: false },
                because:
                    'A world starts spawnRadius at 10 and tntExplosionDropDecay off, the values the pinned BDS ' +
                    'writes to level.dat and sends clients in GameRulesChangedPacket, and a script reads the rule ' +
                    "the world holds. BDS's Script API reads 0 and true for the two",
                reference: 'packages/prismarine/src/world/GameRuleManager.ts'
            },
            'set every game rule': {
                fields: { spawnRadius: 13, tntExplosionDropDecay: true },
                because:
                    'The script raises each number by 3 and flips each boolean from what it read, so the two ' +
                    'rules start from the world defaults, 10 and off, where BDS starts from 0 and true',
                reference: 'packages/prismarine/src/world/GameRuleManager.ts'
            },
            'game rules after the commands': {
                fields: { tntExplosionDropDecay: true },
                because:
                    'A gamerule command writes back the value the script set, so tntExplosionDropDecay keeps ' +
                    'the flipped world default',
                reference: 'packages/prismarine/src/world/GameRuleManager.ts'
            },
            'server defaults': {
                observed: { value: { randomTickSpeed: 3, showCoordinates: true } },
                because:
                    "JSPrismarine's random ticks follow Java's random_tick_speed, whose 3 draws per section a world " +
                    "starts with, since Bedrock's 1 names only a relative speed, and a level shows coordinates",
                reference: 'packages/engine-systems/src/randomTick.ts and packages/prismarine/src/world/Level.ts'
            }
        }
    }
];
