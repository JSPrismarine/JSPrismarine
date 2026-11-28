/**
 * The script runtime of one world: one engine, one context per pack, and the lifecycle, the
 * system tasks, the events and the watchdog around them
 * ([ADR 0020](../../../../docs/adr/0020-scripts-run-in-quickjs-on-the-world-thread.md)).
 *
 * The server drives it at fixed points and nowhere else:
 *
 * 1. {@link WorldScripts.startEarly} runs the version 2 packs' top levels in early execution,
 *    resolves their promises once, and sends `system.beforeEvents.startup`.
 * 2. {@link WorldScripts.startWorld}, once the world has loaded, runs the version 1 packs' top
 *    levels and sends `world.beforeEvents.worldInitialize`.
 * 3. {@link WorldScripts.flush} is the script flush phase at the end of every tick
 *    ([ADR 0015](../../../../docs/adr/0015-a-tick-is-a-fixed-sequence-of-synchronous-phases.md)).
 *    The first one sends `worldLoad`, and version 1's `worldInitialize` after-event.
 * 4. Before-events run inline, as guards the runtime registers on the world's actions
 *    ([ADR 0013](../../../../docs/adr/0013-vetoable-actions-are-staged.md)).
 *
 * The flush follows the loop Bedrock documents, in the order the `startup-order`,
 * `system-tasks` and `weather-events` scenarios recorded on the pinned Bedrock Dedicated Server:
 * version 1 promise jobs once, then until nothing is left, version 2 promise jobs, the system
 * tasks due, each followed by version 2 promise jobs, and the after-events, each event type
 * followed by version 2 promise jobs.
 *
 * Every limit counts steps, not time ([ADR 0021](../../../../docs/adr/0021-the-script-watchdog-counts-steps.md)).
 */
import {
    ScriptError,
    ScriptHostErrors,
    ScriptOutOfMemoryError,
    ScriptTerminatedError
} from '@jsprismarine/errors/script-host';

import type { ScriptContextId, ScriptEngine, ScriptHostLibrary } from '../ScriptEngine';
import { ScriptApiContext } from '../shape/binding';
import type { Privilege } from '../shape/format';
import type { ModuleShape } from '../shape/history';
import { implementationCoverage } from '../shape/implementations';
import type { ScriptApiImplementations } from '../shape/implementations';
import { resolveDependency } from '../shape/resolve';
import { parseVersion } from '../shape/version';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import { scanCoverage } from './coverage';
import type { GameTestCall, GameTestReply } from './gametest';
import { GAMETEST, GameTests } from './gametest';
import type { ComponentKind } from './customContent';
import { CustomContent } from './customContent';
import { installInputsSource, randomState } from './inputs';
import type { AddonConfigStore } from './addonConfig';
import type { JsprismarineServerInfo } from './jsprismarineServer';
import {
    JSPRISMARINE_CONFIG_FUNCTIONS,
    JSPRISMARINE_HOST_FUNCTIONS,
    JSPRISMARINE_MODULE,
    JSPRISMARINE_PLACEHOLDERS_HOST_FUNCTIONS,
    JSPRISMARINE_PLACEHOLDERS_MODULE,
    jsprismarineServerSource,
    LEVEL_HOST_FUNCTIONS,
    PERMISSION_HOST_FUNCTIONS,
    placeholdersModuleSource,
    SERVER_LIST_HOST_FUNCTIONS
} from './jsprismarineServer';
import type { JsprismarineServerMembers, ScriptPermissionsChange } from './jsprismarineMembers';
import {
    bossBarOptions,
    ScriptBossBars,
    ScriptPlayerListNames,
    ScriptServerList,
    SERVER_PLACEHOLDER_OWNER,
    serverListOptions
} from './jsprismarineMembers';
import { ScriptPlaceholders } from './placeholders';
import type { TemplateHost } from './templates';
import { parseShorthand, renderTemplate, templateOf } from './templates';
import type { EntityFilter, EventData, PackHost, SignalName, WatchdogTerminateReason } from './minecraftServer';
import { passesFilter, serverImplementations } from './minecraftServer';
import type { FormPlayer } from './minecraftServerUi';
import { serverUiImplementations } from './minecraftServerUi';
import type { DebugPackHost } from './debugUtilities';
import { DEBUG_UTILITIES, debugUtilitiesImplementations, PackDebugDrawer } from './debugUtilities';
import { SERVER_ADMIN, serverAdminImplementations } from './serverAdmin';
import { PackNet } from './netKit';
import { SERVER_NET, serverNetImplementations } from './serverNet';
import type { ScriptDeferred } from './serverGametest';
import { GAMETEST_TAG, gametestImplementations } from './serverGametest';
import type { EntityKey } from './serverObjects';
import { entityKeyOf, PLAYER, TAG } from './serverObjects';
import type { ScriptConfig, ScriptModuleConfig, ScriptPack } from './pack';
import { packLabel, packScripts, readPackBytes, readPackFile } from './pack';
import { PackForms, SERVER_UI } from './PackForms';
import { DataDrivenUi } from './dataDrivenUi';
import { ScriptForms } from './ScriptForms';
import { ScriptHttp } from './ScriptHttp';
import { hookEventOf } from './serverCustom';
import { passesWorldEventOptions } from './events/eventOptions';
import type { GameEventData } from './events/eventValues';
import { gameEventData } from './events/eventValues';
import { isBeforeEvent, signalOfEvent } from './events/worldEvents';
import { JobQueue } from './jobs';
import type { JobStep } from './jobs';
import { TaskQueue } from './tasks';
import type {
    BlockBreakIntent,
    BlockInteractIntent,
    EntityInteractIntent,
    ChatSendIntent,
    ItemUseIntent,
    ScriptBlockHook,
    ScriptBlockHookEvent,
    ScriptAdminServer,
    ScriptCommandArgument,
    ScriptCommandOrigin,
    ScriptCommandOutcome,
    ScriptComponentSink,
    ScriptComponentUse,
    ScriptDebugShapeChange,
    ScriptGameEvent,
    ScriptGameEventVerdict,
    ScriptItemHook,
    ScriptItemHookEvent,
    ScriptWorld,
    ScriptWorldEvent,
    VetoVerdict,
    WeatherChangeIntent
} from './world';

/** A `/gametest` subcommand, as BDS's command takes them. */
export type GameTestCommand =
    | { readonly kind: 'run'; readonly name: string }
    | { readonly kind: 'runset'; readonly tag?: string }
    | { readonly kind: 'stopall' }
    | { readonly kind: 'clearall' };

/** Where the runtime writes the content log: what scripts print, their errors and the watchdog's. */
export interface ScriptLog {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

/** A critical exception the watchdog reports, by the name BDS gives its type. */
export type CriticalException = 'Hang' | 'StackOverflow' | 'OutOfMemory';

/**
 * The steps a callback may take for each millisecond of `script-watchdog-hang-threshold`. A step
 * is a fixed amount of interpreter work, so this is a default an admin changes, not a
 * measurement of any machine ([ADR 0021](../../../../docs/adr/0021-the-script-watchdog-counts-steps.md)).
 */
export const STEPS_PER_MILLISECOND = 10;

/** BDS's default `script-watchdog-hang-threshold`, in milliseconds. */
export const DEFAULT_HANG_THRESHOLD = 10_000;

/** The watchdog settings, under the meaning BDS's `script-watchdog-*` properties give them. */
export interface WatchdogSettings {
    /** The steps one callback may take, everything it calls included. */
    readonly hangSteps: number;
    /** `script-watchdog-enable-shutdown`: whether a critical exception shuts the server down. */
    readonly shutdown: boolean;
    /** The bytes every pack's scripts may allocate together; unlimited when absent. */
    readonly memoryLimit?: number;
}

/**
 * Reads the watchdog settings from BDS's property names and values.
 * @param properties - The `script-watchdog-*` properties, as `server.properties` writes them.
 */
export const watchdogSettings = (properties: Readonly<Record<string, string | undefined>>): WatchdogSettings => {
    const number = (key: string): number | undefined => {
        const value = Number(properties[key]);
        return properties[key] === undefined || !Number.isFinite(value) ? undefined : value;
    };
    const megabytes = number('script-watchdog-memory-limit');
    return {
        hangSteps: (number('script-watchdog-hang-threshold') ?? DEFAULT_HANG_THRESHOLD) * STEPS_PER_MILLISECOND,
        shutdown: properties['script-watchdog-enable-shutdown'] !== 'false',
        ...(megabytes === undefined || megabytes <= 0 ? {} : { memoryLimit: megabytes * 1024 * 1024 })
    };
};

/** How a {@link WorldScripts} is made. */
export interface WorldScriptsOptions {
    readonly library: ScriptHostLibrary;
    readonly world: ScriptWorld;
    /** The world's behavior packs with a script module, in the order the world lists them. */
    readonly packs: readonly ScriptPack[];
    readonly config: ScriptConfig;
    /**
     * Whether the world turns on the Beta APIs experiment, which a pack that declares a beta
     * module version needs. Off when absent, as in a world created without it.
     */
    readonly betaApis?: boolean;
    readonly log: ScriptLog;
    /** The server the packs run on, which `@jsprismarine/server` tells them about. */
    readonly server: JsprismarineServerInfo;
    /**
     * What `@jsprismarine/server`'s `performance`, `getPing`, `bossBars` and `playerList` reach
     * of the running server. Without it, the module leaves those members out, as an older server
     * would.
     */
    readonly members?: JsprismarineServerMembers;
    /**
     * The server `@minecraft/server-admin`'s `dedicatedServer` and its functions reach. Without
     * it, those members do nothing.
     */
    readonly admin?: ScriptAdminServer;
    /**
     * The packs' config files, which `@jsprismarine/server`'s `config` reads, writes and
     * follows. Without it, the module leaves `config` out.
     */
    readonly addonConfig?: AddonConfigStore;
    /** The world's seed, which `Math.random` is seeded from. */
    readonly seed: bigint;
    readonly watchdog?: WatchdogSettings;
    /** Asked to shut the server down after a critical exception, when the watchdog says to. */
    readonly onShutdown?: (reason: CriticalException) => void;
    /**
     * Called when a pack's context is ready and before any of its scripts run, with the UUID of
     * its script module, so a debugger that attaches here stops at the pack's first line.
     */
    readonly onPackLoaded?: (moduleUuid: string, target: ScriptDebugTarget) => void;
}

/** Where a debugger attaches to debug one pack: the world's engine and the pack's context in it. */
export interface ScriptDebugTarget {
    readonly engine: ScriptEngine;
    readonly context: ScriptContextId;
}

/**
 * The interpreter steps the jobs of one tick may take together when the world admits no budget
 * of its own ({@link ScriptWorld.jobSteps}). A step is a fixed amount of interpreter work, so a
 * replay advances every job as far
 * ([ADR 0021](../../../../docs/adr/0021-the-script-watchdog-counts-steps.md)), and a job that
 * never ends leaves the rest of the tick to everything else.
 */
export const JOB_STEPS_PER_TICK = 100;

/** How long the last tick ran, and how long a tick should take, for {@link jobStepsForTick}. */
export interface JobSliceInputs {
    /** The time a tick has at the current tick rate, 50 ms at 20 ticks a second. */
    readonly periodMs: number;
    /** How long the last tick took, as the input step admitted it. */
    readonly lastTickMs: number;
    /** The steps the last tick's jobs took; see {@link WorldScripts.jobStepsLastTick}. */
    readonly lastJobSteps: number;
}

/**
 * The steps this tick's jobs may take. BDS gives `system.runJob` jobs a time slice from its
 * frame-time estimates, which is what the rest of the tick leaves of its period, so an idle
 * server advances a job through most of each tick. Here the rest of the last tick is its time
 * less its jobs' steps at {@link STEPS_PER_MILLISECOND}, and what that leaves of the period
 * turns back into steps at the same ratio. The host admits the last tick's time once, at the
 * input step, so a replay that admits the same times advances every job as far.
 *
 * Never fewer than {@link JOB_STEPS_PER_TICK}, so a slow tick still advances its jobs, and never
 * more than a whole period's steps.
 */
export const jobStepsForTick = ({ periodMs, lastTickMs, lastJobSteps }: JobSliceInputs): number => {
    const otherWorkMs = Math.max(0, lastTickMs - lastJobSteps / STEPS_PER_MILLISECOND);
    const steps = Math.floor((periodMs - otherWorkMs) * STEPS_PER_MILLISECOND);
    return Math.min(Math.max(steps, JOB_STEPS_PER_TICK), Math.floor(periodMs * STEPS_PER_MILLISECOND));
};

/**
 * The first tag an event object gets. Event tags count up from here, past every fixed tag in
 * `TAG`, so a member that tells objects apart by a fixed tag, such as a custom component hook's
 * `BlockEvent`, never takes an event for one.
 */
const EVENT_TAG_START = 1_000_000;

/** How many entity objects a pack holds before the first time the gone ones leave. */
const ENTITY_PRUNE_START = 256;

/** The ones a pack's lifecycle is chosen by. */
const SERVER_MODULE = '@minecraft/server';

/** One loaded pack. */
interface LoadedPack {
    readonly pack: ScriptPack;
    readonly context: ScriptContextId;
    readonly api: ScriptApiContext;
    readonly implementations: ScriptApiImplementations;
    /** 1 or 2: the major version of `@minecraft/server` it declares. */
    readonly lifecycle: 1 | 2;
    /** The namespaces of the modules its manifest declares. */
    readonly modules: Map<string, ScriptHandle>;
    readonly shapes: ModuleShape[];
    readonly instances: Map<string, ScriptHandle>;
    /** The pack's object for each entity it has seen, by entity id. */
    readonly entities: Map<string, ScriptHandle>;
    /** Sets the clock its `Date` reads. */
    setNow?: ScriptHandle;
    /** Its `@jsprismarine/server` namespace, made the first time it imports the module. */
    jsp?: ScriptHandle;
    /** Its `@jsprismarine/placeholders` namespace, made the first time it imports the module. */
    placeholders?: ScriptHandle;
    /** What the `config/` folder said about its script module when it loaded, or when it was last reloaded. */
    moduleConfig: ScriptModuleConfig;
    /** Its `config.afterEvents.change` callbacks, in subscription order. */
    configListeners?: ScriptHandle[];
    /** Makes a `change` event from the file's JSON, with the intrinsics its module captured. */
    configEventMaker?: ScriptHandle;
    /** A `change` the flush budget cut short: the value as JSON and the callbacks still due. */
    configDelivery?: { readonly json: string | undefined; readonly remaining: ScriptHandle[] };
    /** Stops the watch on its config file, once `config` has started one. */
    stopConfigWatch?: () => void;
    /** Whether its config file changed since the last flush looked. */
    configChanged?: boolean;
    /** The function its `permissions.afterEvents.permissionsChange` subscribers are called through. */
    permissionsChange?: ScriptHandle;
    /** Its `@minecraft/server-ui` forms, when it declares the module. */
    forms?: PackForms;
    /**
     * Its realm's `JSON.parse`, taken before any of its code runs, for `@minecraft/server-admin`'s
     * variables, when it declares the module.
     */
    parseJson?: ScriptHandle;
    /** Its `@minecraft/server-net` request header lists, when it declares the module. */
    net?: PackNet;
    /** Its debug shape drawer, which `debugDrawer` and `world.primitiveShapesManager` draw through. */
    debug?: PackDebugDrawer;
    /** What its debug shapes reach. */
    debugHost?: DebugPackHost;
}

/** A `levels` operation of `@jsprismarine/server` a pack started. */
interface LevelCall {
    readonly loaded: LoadedPack;
    /** Settles the pack's promise: with an error message, or with the value as JSON. */
    readonly settle: ScriptHandle;
}

/** A callback a pack subscribed to a signal. */
interface Subscription {
    readonly signal: SignalName;
    readonly loaded: LoadedPack;
    readonly callback: ScriptHandle;
    /** The entities an entity event's callback gets, from its `EntityEventOptions`. */
    readonly filter?: EntityFilter;
}

/** A system task's callback and the pack that queued it. */
interface TaskCallback {
    readonly loaded: LoadedPack;
    readonly callback: ScriptHandle;
}

/**
 * An after-event waiting for the flush: one the lifecycle queued, one the world committed, or a
 * custom component hook the world raised.
 */
type AfterEvent =
    | { readonly type: 'worldLoad' }
    | { readonly type: 'worldInitialize' }
    | { readonly type: 'blockHook'; readonly event: ScriptBlockHookEvent }
    | { readonly type: 'itemHook'; readonly event: ScriptItemHookEvent }
    | ScriptWorldEvent;

/** The hooks a block naming a component in `minecraft:custom_components` does not get on BDS. */
const LEGACY_SKIPPED_HOOKS: ReadonlySet<string> = new Set(['onBreak']);

/** The block hooks a script can cancel, which run at once rather than in the flush. */
const BEFORE_HOOKS: ReadonlySet<string> = new Set<ScriptBlockHook>(['beforeOnPlayerPlace']);

/** What a script's `import()` of a native module the manifest does not declare rejects with on BDS. */
const unrecognized = (name: string): ReferenceError => new ScriptHostErrors.UnrecognizedModule({ name });

/** A template as the pack's `JSON.stringify` wrote it, parsed; the renderer checks its shape after. */
const templateJson = (source: string): unknown => {
    try {
        // The pack's own JSON.stringify wrote it, so only a value JSON cannot carry fails here.
        return JSON.parse(source) as unknown;
    } catch {
        throw new ScriptHostErrors.TemplateInvalid({ where: 'template', problem: 'must be an object JSON can carry' });
    }
};

/** A thrown value as the content log shows it: a script's error with its stack, anything else as text. */
const describeThrown = (error: unknown): string => {
    if (!(error instanceof ScriptError)) return String(error);
    const stack = error.scriptStack.trim();
    return `${error.message}${stack === '' ? '' : `    ${stack}`}`;
};

/** The script runtime of one world. */
export class WorldScripts {
    private readonly options: WorldScriptsOptions;
    private engine: ScriptEngine;
    private loaded: LoadedPack[] = [];
    /** The `config/` folder as last read; `reloadScriptingConfig` reads it again. */
    private config: ScriptConfig;
    private readonly byContext = new Map<ScriptContextId, LoadedPack>();
    private subscriptions: Subscription[] = [];
    private tasks = new TaskQueue<TaskCallback>();
    private jobs = new JobQueue<TaskCallback>();
    private readonly lifecycleEvents: AfterEvent[] = [];
    private readonly events = new Map<number, EventData>();
    private nextEventTag = EVENT_TAG_START;
    private privilege: Privilege = 'default';
    private tick = 0;
    /**
     * The next `@minecraft/debug-utilities` shape's id. A reload keeps counting, so no shape of the
     * new runtime shares an id with one the world drew for the old.
     */
    private nextShapeId = 1;
    private clock: number | undefined;
    /** The steps the jobs took in the last tick; see {@link WorldScripts.jobStepsLastTick}. */
    private lastJobSteps = 0;
    private releaseGuards: (() => void)[] = [];
    /** Set once scripts may no longer run: after a teardown, or a critical exception that shuts down. */
    private stopped = false;
    /** Set once {@link WorldScripts.shutdown} has freed the engine and released the guards. */
    private disposed = false;
    /**
     * The callbacks the current flush has entered. Each one costs a step of the tick's budget
     * on top of the steps it takes, since the engine counts none for a callback too short to
     * reach a poll, and a chain of those would otherwise never end a tick.
     */
    private tickEntries = 0;
    /** Set while `watchdogTerminate` is delivered, so a handler that itself trips the watchdog shuts down. */
    private deliveringWatchdogTerminate = false;
    /** How many entity objects a pack may hold before the ones of entities that are gone leave. */
    private entityPruneAt = ENTITY_PRUNE_START;
    /** The pack whose callback the runtime entered last, which a tick that runs over is blamed on. */
    private lastEntered: LoadedPack | undefined;
    /** The `@minecraft/server-ui` forms the world's players have open. */
    private readonly forms = new ScriptForms<LoadedPack>(() => this.engine);
    /** The data-driven screens and observables the packs have made. */
    private readonly dataDriven = new DataDrivenUi<LoadedPack>(() => ({
        channel: this.options.world.forms,
        engine: this.engine,
        players: () => this.options.world.players(),
        pack: (id) => {
            const loaded = this.byContext.get(Number(id));
            if (loaded?.forms === undefined) return undefined;
            return {
                forms: loaded.forms,
                api: loaded.api,
                owner: loaded,
                player: (value) => this.formPlayer(loaded, value)
            };
        },
        nextFormId: () => this.forms.nextFormId()
    }));
    /** The `@minecraft/server-net` requests the packs have in flight. */
    private readonly http = new ScriptHttp<LoadedPack>();
    /**
     * The `levels` operations the packs started, each with the function that settles its promise.
     * One that finishes moves to {@link levelSettlements}; a reload or shutdown drops the rest.
     */
    private readonly levelCalls = new Set<LevelCall>();
    /** The `levels` operations that finished, settled on the next flush in the order they finished. */
    private readonly levelSettlements: { readonly call: LevelCall; readonly error?: string; readonly json?: string }[] =
        [];
    /** The world's GameTests, which a reload clears. */
    private readonly gametests: GameTests<LoadedPack>;
    /** The ids of the simulated players GameTests spawned, whose objects are `SimulatedPlayer`s. */
    private readonly simulated = new Set<string>();
    /** The custom commands and components the packs registered, which a reload replaces. */
    private custom: CustomContent<LoadedPack>;
    /** Which lifecycle event lets packs register custom content now, if any. */
    private registering: 'startup' | 'worldInitialize' | undefined;
    /** Takes the custom commands and the component sink off the world, before a reload or a shutdown. */
    private releaseCustom: (() => void)[] = [];
    /**
     * The boss bars the packs show through `@jsprismarine/server`. A reload keeps counting their
     * ids, so no bar of the new runtime shares one with a bar of the old.
     */
    private readonly bossBars: ScriptBossBars | undefined;
    /** The player list names the packs set through `@jsprismarine/server`. */
    private readonly playerListNames: ScriptPlayerListNames | undefined;
    /** The server list changes the packs make through `@jsprismarine/server`, each pack its own owner. */
    private readonly serverList: ScriptServerList | undefined;
    /**
     * The placeholder namespaces the packs register through `@jsprismarine/server`, and the ones
     * the server registers under an owner of its own. A reload ends the packs' registrations and
     * keeps the server's.
     */
    public readonly placeholders: ScriptPlaceholders;

    /** Stops hearing of permission changes, at shutdown. */
    private readonly stopPermissionChanges: (() => void) | undefined;

    public constructor(options: WorldScriptsOptions) {
        this.options = options;
        this.placeholders = new ScriptPlaceholders({
            failed: (owner, namespace, error) =>
                this.options.log.error(
                    `[Scripting] [${owner.name}] The placeholder provider of ${namespace} threw, and its tokens stay as written: ${describeThrown(error)}`
                ),
            // The watchdog's errors end the render, so a resolver that hangs charges the script
            // that renders, as the budget says.
            fatal: (error) => error instanceof ScriptTerminatedError || error instanceof ScriptOutOfMemoryError
        });
        this.engine = this.createEngine();
        this.gametests = new GameTests<LoadedPack>({
            world: options.world,
            log: options.log,
            call: (loaded, callback, args) => this.callForTest(loaded, callback, args),
            createTest: (loaded, run) => loaded.api.create(GAMETEST, 'Test', GAMETEST_TAG.test, String(run)),
            onRejected: (loaded, promise, rejected) => this.onRejected(loaded, promise, rejected),
            structure: (loaded, path) =>
                readPackBytes(loaded.pack, path) ??
                this.loaded.map((each) => readPackBytes(each.pack, path)).find((bytes) => bytes !== undefined),
            free: (handle) => this.engine.free(handle)
        });
        this.config = options.config;
        this.custom = this.customContent();
        this.bossBars = options.members === undefined ? undefined : new ScriptBossBars(options.members);
        this.playerListNames = options.members === undefined ? undefined : new ScriptPlayerListNames(options.members);
        const serverList = options.members?.serverList;
        this.serverList = serverList === undefined ? undefined : new ScriptServerList(serverList);
        const permissions = options.members?.permissions;
        if (permissions !== undefined) {
            this.stopPermissionChanges = permissions.onChange((change) => this.permissionsChanged(change));
            // The server's own namespace, which survives a reload as the packs' do not.
            this.placeholders.register(SERVER_PLACEHOLDER_OWNER, 'perms', {
                keys: ['primary_group', 'groups', 'prefix', 'suffix', 'weight'],
                resolve: (key, player) => {
                    if (player === undefined) return undefined;
                    switch (key) {
                        case 'primary_group':
                            return permissions.primaryGroupOf(player);
                        case 'groups':
                            return permissions.groupsOf(player).join(', ');
                        case 'weight':
                            return permissions.weightOf(player);
                        default:
                            // Empty rather than the token, so `{perms:prefix}{player:name}` reads right for a player without one.
                            return permissions.metaOf(player, key) ?? '';
                    }
                }
            });
        }
    }

    /**
     * Runs a `/gametest` subcommand. The tests it queues start in the next flush.
     * @returns The command's feedback, or its error.
     */
    public gametest(command: GameTestCommand): GameTestReply {
        switch (command.kind) {
            case 'run':
                return this.gametests.runTest(command.name);
            case 'runset':
                return this.gametests.runSet(command.tag);
            default:
                return this.gametests.stopAll();
        }
    }

    /** `system.currentTick`: the ticks this runtime has flushed, which a reload keeps. */
    public get currentTick(): number {
        return this.tick;
    }

    /** The engine's counters, for tests that count host calls and steps. */
    public stats(): ReturnType<ScriptEngine['stats']> {
        return this.engine.stats();
    }

    /**
     * Finds the pack a debugger's `targetModuleUuid` picks.
     * @param moduleUuid - The UUID of the pack's script module, in any case.
     * @returns The engine and the pack's context, or undefined when no loaded pack has that module.
     * A reload makes a new engine and new contexts, so a debugger attaches again after one.
     */
    public debugTarget(moduleUuid: string): ScriptDebugTarget | undefined {
        const wanted = moduleUuid.toLowerCase();
        const loaded = this.loaded.find((each) => each.pack.moduleUuid.toLowerCase() === wanted);
        return loaded === undefined ? undefined : { engine: this.engine, context: loaded.context };
    }

    /**
     * Loads the version 2 packs and runs them in early execution: each top level, the promise
     * jobs they queued, once, and `system.beforeEvents.startup`. A pack whose dependencies BDS
     * would refuse is left out, and the content log says why.
     */
    public startEarly(): void {
        if (this.releaseGuards.length === 0) {
            this.releaseGuards = [
                this.options.world.guardWeather((intent) => this.weatherGuard(intent)),
                this.options.world.guardChat((intent) => this.chatGuard(intent)),
                this.options.world.watchPlayerLeave((player) => this.playerLeaving(player)),
                this.options.world.guardBlockBreak?.((intent) => this.blockBreakGuard(intent)) ?? (() => {}),
                this.options.world.guardItemUse?.((intent) => this.itemUseGuard(intent)) ?? (() => {}),
                this.options.world.guardBlockInteract?.((intent) => this.blockInteractGuard(intent)) ?? (() => {}),
                this.options.world.guardEntityInteract?.((intent) => this.entityInteractGuard(intent)) ?? (() => {}),
                this.options.world.guardGameEvents?.((event) => this.gameEventGuard(event)) ?? (() => {})
            ];
        }
        this.refreshClock();
        const early = this.loadPacks(2);
        this.withPrivilege('early_execution', () => {
            for (const loaded of early) this.evaluateEntry(loaded);
            for (const loaded of early) this.runJobs(loaded);
            this.registering = 'startup';
            try {
                this.dispatch('StartupBeforeEventSignal', 'early_execution', (loaded) =>
                    this.create(loaded, 'StartupEvent', 0)
                );
            } finally {
                this.registering = undefined;
            }
        });
        this.options.world.settleCustomDimensions?.(this.custom.dimensionList());
        this.commitCommands();
    }

    /**
     * Loads the version 1 packs, once the world has loaded, and runs their top levels and
     * `world.beforeEvents.worldInitialize`. The next flush sends `worldLoad` and version 1's
     * `worldInitialize` after-event.
     */
    public startWorld(): void {
        this.refreshClock();
        const late = this.loadPacks(1);
        for (const loaded of late) this.evaluateEntry(loaded);
        this.registering = 'worldInitialize';
        try {
            this.dispatch('WorldInitializeBeforeEventSignal', 'restricted_execution', (loaded) =>
                this.create(loaded, 'WorldInitializeBeforeEvent', 0)
            );
        } finally {
            this.registering = undefined;
        }
        this.bindComponents();
        this.lifecycleEvents.push({ type: 'worldLoad' }, { type: 'worldInitialize' });
    }

    /**
     * The script flush phase: runs the world's scripts until nothing is left for this tick, then
     * moves `system.currentTick` on.
     */
    public flush(): void {
        if (this.stopped) return;
        this.engine.beginTick();
        this.tickEntries = 0;
        this.flushing = true;
        try {
            this.flushBody();
        } finally {
            this.flushing = false;
        }
    }

    /** Whether a flush is running, so a notification from outside one knows to start a tick budget of its own. */
    private flushing = false;

    private flushBody(): void {
        this.refreshClock();
        this.settleForms();
        this.settleRequests();
        this.settleLevelCalls();
        for (const loaded of this.loaded) if (loaded.lifecycle === 1) this.runJobs(loaded);
        // The GameTest runner and its simulated players go first, as BDS ticks them before the
        // scripts' tasks: a test's function and its delays run ahead of every system task.
        this.gametests.step(this.tick);
        this.options.world.simulatedPlayers?.tick();
        this.runJobsOfTick();
        const withinBudget = (): boolean => this.tickEntries < this.tickBudget();
        for (;;) {
            let work = this.runV2Jobs();
            work += this.tasks.runDue(
                this.tick,
                (task) => {
                    this.invoke(task.callback.loaded, task.callback.callback, 'default', []);
                    if (task.interval === undefined) this.engine.free(task.callback.callback);
                    this.runV2Jobs();
                },
                () => withinBudget() && !this.stopped
            );
            work += this.dispatchConfigChanges(() => withinBudget() && !this.stopped);
            const events = [...this.lifecycleEvents.splice(0), ...this.options.world.takeEvents()];
            let dispatched = 0;
            for (const group of groupByType(events)) {
                if (!withinBudget() || this.stopped) break;
                for (const event of group) this.dispatchAfterEvent(event);
                this.runV2Jobs();
                dispatched += group.length;
            }
            // What the budget left waits for the next tick, in the order it was in.
            this.lifecycleEvents.unshift(...events.slice(dispatched));
            work += dispatched;
            if (this.stopped) break;
            if (!withinBudget() && (this.tasks.hasDue(this.tick) || this.lifecycleEvents.length > 0)) {
                this.tickOverrun();
                break;
            }
            if (work === 0) break;
        }
        this.drawDebugShapes(this.loaded.flatMap((loaded) => loaded.debug?.step() ?? []));
        this.tick++;
    }

    /**
     * Reads the `config/` folder again, as `@minecraft/server-admin`'s `reloadScriptingConfig`
     * asks, so every pack's `variables` and `secrets` read the files as they are now.
     */
    public reloadScriptingConfig(): void {
        this.config = this.config.reload?.() ?? this.config;
        for (const entry of this.loaded) entry.moduleConfig = this.config.module(entry.pack.moduleUuid);
    }

    /** The registries of one run, which add the custom dimensions they take to the world. */
    private customContent(): CustomContent<LoadedPack> {
        const world = this.options.world;
        return new CustomContent(this.engine, (typeId) => world.registerCustomDimension?.(typeId) ?? 'registered');
    }

    /**
     * Reloads every pack, as `/reload` does on BDS: `system.beforeEvents.shutdown`, then a new
     * runtime that runs each pack's top level, `startup` and, in the next flush, `worldLoad`.
     * `system.currentTick` carries on.
     */
    public reload(): void {
        if (this.disposed) return;
        this.teardown();
        this.stopped = false;
        this.engine = this.createEngine();
        this.custom = this.customContent();
        this.startEarly();
        this.startWorld();
    }

    /**
     * Sends `system.beforeEvents.shutdown`, frees the engine and takes the runtime's guards off the
     * world. Nothing runs after this. A runtime the watchdog stopped is freed without the event.
     */
    public shutdown(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.stopPermissionChanges?.();
        this.teardown();
        for (const release of this.releaseGuards.splice(0)) release();
    }

    private createEngine(): ScriptEngine {
        const watchdog = this.options.watchdog;
        const engine = this.options.library.createEngine({
            ...(watchdog?.memoryLimit === undefined ? {} : { memoryLimit: watchdog.memoryLimit }),
            loadModule: (name, context) => this.loadModule(name, context)
        });
        // BDS's hang threshold is for a single tick, and no one callback may take more than it either.
        engine.setBudget({ perCallback: this.tickBudget(), perTick: this.tickBudget() });
        return engine;
    }

    /** The steps one tick's scripts may take together, each callback the flush enters counting one more. */
    private tickBudget(): number {
        return this.options.watchdog?.hangSteps ?? DEFAULT_HANG_THRESHOLD * STEPS_PER_MILLISECOND;
    }

    /**
     * A flush whose callbacks reached the tick's budget with more still due: a hang, as BDS
     * reports a tick that runs past its hang threshold. What is still due waits for the next tick.
     */
    private tickOverrun(): void {
        const loaded = this.lastEntered ?? this.loaded[0];
        if (loaded === undefined) return;
        this.critical(loaded, 'Hang', `[Watchdog] Hang detected in '${loaded.pack.name}'`);
    }

    /** Hands the world the flush's debug shape changes, when there are any. */
    private drawDebugShapes(changes: readonly ScriptDebugShapeChange[]): void {
        if (changes.length > 0) this.options.world.drawDebugShapes?.(changes);
    }

    private teardown(): void {
        if (!this.stopped) {
            this.dispatch('ShutdownBeforeEventSignal', 'restricted_execution', (loaded) =>
                this.create(loaded, 'ShutdownEvent', 0)
            );
        }
        this.stopped = true;
        for (const release of this.releaseCustom.splice(0)) release();
        this.custom.free();
        for (const task of this.tasks.drain()) this.engine.free(task.callback.callback);
        this.tasks = new TaskQueue();
        this.jobs.dispose((job) => this.engine.free(job.callback));
        this.jobs = new JobQueue();
        for (const subscription of this.subscriptions) this.engine.free(subscription.callback);
        this.subscriptions = [];
        // Tests belong to the packs that registered them; a reload registers them again.
        this.gametests.clear();
        // A reload or shutdown settles no open form: the contexts that would see it go with it.
        this.forms.clear();
        this.dataDriven.clear();
        this.http.clear(this.options.world.http);
        // A level operation still running finishes on the server, but its promise never settles.
        for (const call of this.levelCalls) this.engine.free(call.settle);
        for (const { call } of this.levelSettlements.splice(0)) this.engine.free(call.settle);
        this.levelCalls.clear();
        // The world stops drawing what the runtime's shapes drew, since nothing can remove them after.
        this.drawDebugShapes(this.loaded.flatMap((loaded) => loaded.debug?.clear() ?? []));
        // A bar belongs to the scripts that showed it, so it goes with them, as does a name they set
        // and a change of the server list.
        this.bossBars?.hideAll();
        this.playerListNames?.resetAll();
        this.serverList?.resetAll();
        for (const loaded of this.loaded) {
            // So does a placeholder namespace, whose resolver is one of the pack's functions.
            this.placeholders.release(loaded.pack);
            loaded.stopConfigWatch?.();
            for (const listener of loaded.configListeners ?? []) this.engine.free(listener);
            if (loaded.configEventMaker !== undefined) this.engine.free(loaded.configEventMaker);
            this.dataDriven.clearOwner(loaded);
            loaded.forms?.destroy();
            loaded.net?.destroy();
            for (const handle of loaded.instances.values()) this.engine.free(handle);
            for (const handle of loaded.entities.values()) this.engine.free(handle);
            if (loaded.setNow !== undefined) this.engine.free(loaded.setNow);
            if (loaded.parseJson !== undefined) this.engine.free(loaded.parseJson);
            if (loaded.jsp !== undefined) this.engine.free(loaded.jsp);
            if (loaded.placeholders !== undefined) this.engine.free(loaded.placeholders);
            if (loaded.permissionsChange !== undefined) this.engine.free(loaded.permissionsChange);
            loaded.api.destroy();
        }
        this.loaded = [];
        this.byContext.clear();
        this.lifecycleEvents.length = 0;
        this.events.clear();
        this.clock = undefined;
        this.engine.destroy();
    }

    /**
     * Resolves and binds every pack of one lifecycle, each in a context of its own. A pack BDS
     * makes no context for, because a module or version is unknown, is logged as BDS logs it: the
     * reason after `failed to create context`, and `run failed` once the lifecycle's packs are loaded.
     */
    private loadPacks(lifecycle: 1 | 2): LoadedPack[] {
        const loaded: LoadedPack[] = [];
        const withoutContext: ScriptPack[] = [];
        for (const pack of this.options.packs) {
            if (lifecycleOf(pack) !== lifecycle) continue;
            const one = this.loadPack(pack, lifecycle);
            if (one === 'no-context') withoutContext.push(pack);
            else if (one !== undefined) loaded.push(one);
        }
        for (const pack of withoutContext) {
            this.options.log.error(
                `[Scripting] Plugin [${packLabel(pack)}] - run failed, no runtime or context available.`
            );
        }
        return loaded;
    }

    /** Loads one pack, or logs why BDS would refuse it and returns undefined, or `no-context`. */
    private loadPack(pack: ScriptPack, lifecycle: 1 | 2): LoadedPack | 'no-context' | undefined {
        const config = this.config.module(pack.moduleUuid);
        const { allowedModules } = config;
        const shapes: ModuleShape[] = [];
        for (const dependency of pack.dependencies) {
            const resolution = resolveDependency(dependency, {
                pack,
                allowedModules,
                betaApis: this.options.betaApis === true
            });
            if (resolution.ok) {
                shapes.push(resolution.shape);
                continue;
            }
            if (resolution.reason === 'unknown-module' || resolution.reason === 'unknown-version') {
                this.options.log.error(`[Scripting] Plugin [${packLabel(pack)}] - failed to create context.`);
                this.options.log.error(`[Scripting] ${resolution.message}`);
                return 'no-context';
            }
            this.options.log.error(`[Scripting] ${resolution.message}`);
            return undefined;
        }

        const engine = this.engine;
        const context = engine.createContext();
        const implementations = serverImplementations({
            engine,
            packUuid: pack.uuid,
            moduleUuid: pack.moduleUuid,
            currentTick: () => this.tick,
            schedule: (kind, callback, delay) =>
                this.tasks.schedule(kind, { loaded: self(), callback: engine.duplicate(callback) }, this.tick, delay),
            clearRun: (id) => {
                const task = this.tasks.clear(id);
                if (task !== undefined) engine.free(task.callback.callback);
            },
            runJob: (generator) => this.jobs.add({ loaded: self(), callback: engine.duplicate(generator) }),
            clearJob: (id) => {
                const job = this.jobs.clear(id);
                if (job !== undefined) engine.free(job.callback);
            },
            subscribe: (signal, callback, filter) =>
                this.subscriptions.push({
                    signal,
                    loaded: self(),
                    callback: engine.duplicate(callback),
                    ...(filter === undefined ? {} : { filter })
                }),
            unsubscribe: (signal, callback) => this.unsubscribe(signal, self(), callback),
            world: this.options.world,
            instance: (className, tag, state) => this.instance(self(), className, tag, state),
            entity: (key) => this.entityObject(self(), key),
            create: (className, tag, state) => this.create(self(), className, tag, state),
            eventData: (tag) => this.events.get(tag),
            custom: this.custom.forPack(
                () => self(),
                shapes.find((shape) => shape.module === SERVER_MODULE),
                () => this.registering === (lifecycle === 2 ? 'startup' : 'worldInitialize')
            ),
            debugShapes: () => self().debugHost,
            serverExport: (name) => {
                const namespace = self().api.namespace(SERVER_MODULE);
                return namespace === undefined ? undefined : engine.get(namespace, name);
            },
            raise: (event) => void this.lifecycleEvents.push({ type: 'game', ...event })
        } satisfies PackHost);
        // Made in the pack's context, so the API's classes and errors belong to the pack's realm
        // and no two packs share a prototype.
        const api = engine.inContext(
            context,
            () =>
                new ScriptApiContext(engine, {
                    pack: pack.name,
                    packId: String(context),
                    implementations,
                    logger: { warn: (message) => this.options.log.warn(`[Scripting] ${message}`) },
                    privilege: () => this.privilege
                })
        );
        const entry: LoadedPack = {
            pack,
            context,
            api,
            implementations,
            lifecycle,
            moduleConfig: config,
            modules: new Map(),
            shapes,
            instances: new Map(),
            entities: new Map()
        };
        const self = (): LoadedPack => entry;

        const ui = shapes.find((shape) => shape.module === SERVER_UI);
        if (ui !== undefined) {
            const forms = new PackForms(engine, context, api, parseVersion(ui.version.version)?.major ?? 2);
            entry.forms = forms;
            serverUiImplementations(implementations, {
                forms,
                player: (value) => this.formPlayer(entry, value),
                show: (player, form) => this.forms.show(this.options.world.forms, entry, forms, player, form),
                closeAll: (player) => this.options.world.forms?.closeAll(player)
            });
            this.dataDriven.register(implementations);
        }
        if (shapes.some((shape) => shape.module === GAMETEST)) {
            gametestImplementations(implementations, {
                engine,
                world: this.options.world,
                tests: this.gametests,
                owner: entry,
                create: (className, tag, state) => api.create(GAMETEST, className, tag, state),
                entity: (key) => this.entityObject(entry, key),
                dimension: (id) => this.instance(entry, 'Dimension', TAG.dimension, id),
                deferred: () => this.deferred(entry),
                simulated: (id) => this.simulated.add(id)
            });
        }
        // Every pack can draw debug text, through `world.primitiveShapesManager` or `debugDrawer`,
        // whose texts read back as parsed JSON.
        entry.parseJson = engine.inContext(context, () => {
            const parse = engine.evaluate('JSON.parse', '<jsp JSON.parse>');
            if (!(parse instanceof ScriptHandle)) throw new ScriptHostErrors.NotAFunction({ what: 'JSON.parse' });
            return parse;
        });
        const parse = (json: string): ScriptValue => {
            const parseJson = entry.parseJson;
            if (parseJson === undefined) throw new ScriptHostErrors.NotAFunction({ what: 'JSON.parse' });
            return engine.call(parseJson, undefined, json);
        };
        if (shapes.some((shape) => shape.module === SERVER_ADMIN)) {
            serverAdminImplementations(implementations, {
                config: () => entry.moduleConfig,
                world: this.options.world,
                ...(this.options.admin === undefined ? {} : { server: this.options.admin }),
                reloadScriptingConfig: () => this.reloadScriptingConfig(),
                create: (className, tag, state) => api.create(SERVER_ADMIN, className, tag, state),
                parse,
                player: (value) => this.formPlayer(entry, value)
            });
        }
        const drawer = new PackDebugDrawer(engine, api);
        entry.debug = drawer;
        entry.debugHost = {
            drawer,
            nextId: () => this.nextShapeId++,
            dimensionOf: (value) => {
                const found = api.identify(value);
                return found?.tag === TAG.dimension ? found.state : undefined;
            },
            dimension: (id) => this.instance(entry, 'Dimension', TAG.dimension, id),
            entity: (key) => this.entityObject(entry, key),
            parse
        };
        if (shapes.some((shape) => shape.module === DEBUG_UTILITIES)) {
            debugUtilitiesImplementations(implementations, entry.debugHost);
        }
        if (shapes.some((shape) => shape.module === SERVER_NET)) {
            const lists = new PackNet(engine, context);
            entry.net = lists;
            serverNetImplementations(implementations, {
                engine,
                lists,
                create: (module, className, tag, state) => api.create(module, className, tag, state),
                deferred: () => this.deferred(entry),
                makeError: (error) => api.makeError(error),
                send: (request, settlement) => this.http.send(this.options.world.http, entry, request, settlement),
                cancelAll: (reason) => this.http.cancelAll(this.options.world.http, entry, reason)
            });
        }
        // `@minecraft/server` first, since a class of another module, such as `SimulatedPlayer`,
        // extends one of its classes.
        const bindOrder = [...shapes].sort(
            (a, b) => Number(b.module === SERVER_MODULE) - Number(a.module === SERVER_MODULE)
        );
        engine.inContext(context, () => {
            for (const shape of bindOrder) entry.modules.set(shape.module, api.bind(shape));
            this.installConsole(entry);
            const installer = engine.evaluate(installInputsSource(), '<jsp inputs>');
            if (!(installer instanceof ScriptHandle))
                throw new ScriptHostErrors.NotAFunction({ what: 'The inputs installer' });
            const words = randomState(this.options.seed, this.loaded.length);
            const setNow = engine.call(installer, undefined, ...words);
            engine.free(installer);
            if (setNow instanceof ScriptHandle) entry.setNow = setNow;
        });
        if (this.clock !== undefined && entry.setNow !== undefined) engine.call(entry.setNow, undefined, this.clock);

        this.loaded.push(entry);
        this.byContext.set(context, entry);
        this.reportCoverage(entry);
        this.options.onPackLoaded?.(pack.moduleUuid, { engine, context });
        return entry;
    }

    /** Gives a pack's context `console`, whose lines go to the content log under the pack's name. */
    private installConsole(loaded: LoadedPack): void {
        const engine = this.engine;
        const line = (args: readonly ScriptValue[]): string =>
            args.map((arg) => (arg instanceof ScriptHandle ? describeObject(engine, arg) : String(arg))).join(' ');
        const target = engine.evaluate('globalThis.console = {}');
        if (!(target instanceof ScriptHandle)) throw new ScriptHostErrors.NotAnObject({ what: 'console' });
        const methods: Array<[string, (message: string) => void]> = [
            ['log', (message) => this.options.log.info(message)],
            ['info', (message) => this.options.log.info(message)],
            ['debug', (message) => this.options.log.info(message)],
            ['warn', (message) => this.options.log.warn(message)],
            ['error', (message) => this.options.log.error(message)]
        ];
        for (const [name, write] of methods) {
            const fn = engine.hostFunction(name, (...args) => {
                const text = line(args);
                // A call with nothing to print, such as a bare `console.error()`, would leave a
                // line that says only `[Scripting]`, so it names the pack and where it was made.
                write(
                    text.trim() === ''
                        ? `[Scripting] [${loaded.pack.name}] ${this.emptyConsoleLine(name)}`
                        : `[Scripting] ${text}`
                );
                return undefined;
            });
            engine.set(target, name, fn);
            engine.free(fn);
        }
        engine.free(target);
    }

    /** What the content log shows for a `console` call that printed nothing: the call and its script stack. */
    private emptyConsoleLine(method: string): string {
        const stack = this.engine.evaluate('new Error().stack', '<jsp console>');
        // The first two frames are this evaluation and the native console method.
        const frames = typeof stack === 'string' ? stack.trim().split('\n').slice(2).join('\n').trim() : '';
        return `console.${method}() printed nothing${frames === '' ? '' : `    ${frames}`}`;
    }

    /** Runs a pack's entry module, logging what it throws. */
    private evaluateEntry(loaded: LoadedPack): void {
        const source = readPackFile(loaded.pack, loaded.pack.entry);
        if (source === undefined) {
            this.options.log.error(`[Scripting] [${loaded.pack.name}] The entry ${loaded.pack.entry} does not exist`);
            return;
        }
        this.guarded(loaded, () => {
            const namespace = this.engine.inContext(loaded.context, () =>
                this.engine.evaluateModule(loaded.pack.entry, source)
            );
            this.engine.free(namespace);
        });
    }

    private loadModule(name: string, context: ScriptContextId): string | ScriptHandle | undefined {
        const loaded = this.byContext.get(context);
        if (loaded === undefined) return undefined;
        const declared = loaded.modules.get(name);
        if (declared !== undefined) return declared;
        if (name === JSPRISMARINE_MODULE) {
            loaded.jsp ??= this.jsprismarineNamespace(loaded);
            return loaded.jsp;
        }
        if (name === JSPRISMARINE_PLACEHOLDERS_MODULE) {
            loaded.placeholders ??= this.placeholdersNamespace(loaded);
            return loaded.placeholders;
        }
        if (name.startsWith('@')) throw unrecognized(name);
        // BDS resolves an import without an extension, such as `./close_open_vent`, to the `.js`
        // file beside it, and published packs rely on it. The engine keys the module by the name
        // as imported, so a file imported both ways evaluates once per spelling.
        return readPackFile(loaded.pack, name) ?? readPackFile(loaded.pack, `${name}.js`);
    }

    /**
     * Makes a pack's `@jsprismarine/server` namespace in its context, with the members that reach
     * the running server when the server gives them.
     */
    private jsprismarineNamespace(loaded: LoadedPack): ScriptHandle {
        const engine = this.engine;
        const make = engine.evaluate(jsprismarineServerSource(this.options.server), '<jsprismarine/server>');
        if (!(make instanceof ScriptHandle)) throw new ScriptHostErrors.NotAFunction({ what: 'The module maker' });
        const { members } = this.options;
        const bars = this.bossBars;
        const names = this.playerListNames;
        const host =
            members === undefined || bars === undefined || names === undefined
                ? undefined
                : this.jsprismarineHost(loaded, members, bars, names);
        try {
            const namespace = engine.call(make, undefined, host);
            if (!(namespace instanceof ScriptHandle))
                throw new ScriptHostErrors.NotAnObject({ what: 'The @jsprismarine/server namespace' });
            return namespace;
        } finally {
            engine.free(make);
            if (host !== undefined) engine.free(host);
        }
    }

    /** The host functions a pack's `@jsprismarine/server` members call, on one object. */
    private jsprismarineHost(
        loaded: LoadedPack,
        members: JsprismarineServerMembers,
        bars: ScriptBossBars,
        names: ScriptPlayerListNames
    ): ScriptHandle {
        const engine = this.engine;
        const host = engine.evaluate('({})');
        if (!(host instanceof ScriptHandle))
            throw new ScriptHostErrors.NotAnObject({ what: 'The @jsprismarine/server host' });
        const playerOf = (value: ScriptValue, member: string) => this.playerArgument(loaded, value, member);
        const barId = (value: ScriptValue): number => (typeof value === 'number' ? value : 0);
        const store = this.options.addonConfig;
        const functions: Record<(typeof JSPRISMARINE_HOST_FUNCTIONS)[number], (...args: ScriptValue[]) => ScriptValue> =
            {
                read: (name, index) => {
                    const values: Readonly<Record<string, number | readonly number[]>> = members.performance();
                    const value = typeof name === 'string' ? values[name] : undefined;
                    if (typeof value === 'number') return value;
                    return typeof index === 'number' ? value?.[index] : undefined;
                },
                ping: (value) => {
                    const player = playerOf(value, 'getPing');
                    return player.present ? members.ping(player.id) : undefined;
                },
                showBar: (value, options) => {
                    const player = playerOf(value, 'bossBars.show');
                    return bars.show(player.id, player.present, bossBarOptions(engine, options, 'bossBars.show'));
                },
                updateBar: (id, options) => {
                    bars.update(barId(id), bossBarOptions(engine, options, 'BossBar.update'));
                    return undefined;
                },
                hideBar: (id) => {
                    bars.hide(barId(id));
                    return undefined;
                },
                barValid: (id) => bars.isShown(barId(id)),
                setListName: (value, name) => {
                    const player = playerOf(value, 'playerList.setDisplayName');
                    if (typeof name !== 'string' || name.length === 0) {
                        throw new ScriptHostErrors.JspModuleArgument({
                            member: 'playerList.setDisplayName',
                            expected: 'a non-empty string',
                            argument: 'name'
                        });
                    }
                    names.set(player.id, player.present, name);
                    return undefined;
                },
                resetListName: (value) => {
                    names.reset(playerOf(value, 'playerList.reset').id);
                    return undefined;
                },
                ...this.serverListFunctions(loaded),
                readConfig: () => {
                    const value = store?.read(loaded.pack);
                    return value === undefined ? undefined : JSON.stringify(value);
                },
                writeConfig: (json) => {
                    if (typeof json !== 'string' || store === undefined) {
                        throw new ScriptHostErrors.JspModuleArgument({
                            member: 'config.write',
                            expected: 'a value JSON can carry',
                            argument: 'value'
                        });
                    }
                    // The pack's own JSON.stringify wrote it, so it parses.
                    store.write(loaded.pack, JSON.parse(json) as unknown);
                    return undefined;
                },
                onConfigChange: (callback) => {
                    if (!(callback instanceof ScriptHandle) || !this.isFunction(loaded, callback)) {
                        throw new ScriptHostErrors.JspModuleArgument({
                            member: 'config.afterEvents.change.subscribe',
                            expected: 'a function',
                            argument: 'callback'
                        });
                    }
                    this.watchConfig(loaded);
                    (loaded.configListeners ??= []).push(engine.duplicate(callback));
                    return undefined;
                },
                offConfigChange: (callback) => {
                    if (callback instanceof ScriptHandle) this.unsubscribeConfig(loaded, callback);
                    return undefined;
                },
                setConfigEventMaker: (maker) => {
                    if (!(maker instanceof ScriptHandle)) return undefined;
                    if (loaded.configEventMaker !== undefined) engine.free(loaded.configEventMaker);
                    loaded.configEventMaker = engine.duplicate(maker);
                    return undefined;
                },
                ...this.permissionFunctions(loaded, (value, member) => this.playerArgument(loaded, value, member)),
                ...this.levelFunctions(loaded, members, (value, member) => this.playerArgument(loaded, value, member))
            };
        const permissions = members.permissions;
        const configFunctions: readonly string[] = JSPRISMARINE_CONFIG_FUNCTIONS;
        for (const name of JSPRISMARINE_HOST_FUNCTIONS) {
            // Without a store the module leaves `config` out, which it tells by the functions' absence.
            if (store === undefined && configFunctions.includes(name)) continue;
            // Without the permission files, the module leaves `permissions` out, so its functions are not installed.
            if (permissions === undefined && (PERMISSION_HOST_FUNCTIONS as readonly string[]).includes(name)) continue;
            // Without level management, the module leaves `levels` out in the same way.
            if (members.levels === undefined && (LEVEL_HOST_FUNCTIONS as readonly string[]).includes(name)) continue;
            // And `serverList` without a status to change.
            if (this.serverList === undefined && (SERVER_LIST_HOST_FUNCTIONS as readonly string[]).includes(name))
                continue;
            const fn = engine.hostFunction(name, functions[name]);
            engine.set(host, name, fn);
            engine.free(fn);
        }
        return host;
    }

    /** The player a pack passed, or a `TypeError` naming the member it called. */
    private playerArgument(loaded: LoadedPack, value: ScriptValue, member: string): FormPlayer {
        const player = this.formPlayer(loaded, value);
        if (player === undefined) {
            throw new ScriptHostErrors.JspModuleArgument({ member, expected: 'a Player', argument: 'player' });
        }
        return player;
    }

    /** Starts following a pack's config file, once, so the next flush after a change raises its event. */
    private watchConfig(loaded: LoadedPack): void {
        const store = this.options.addonConfig;
        if (store === undefined || loaded.stopConfigWatch !== undefined) return;
        loaded.stopConfigWatch = store.watch(loaded.pack, () => {
            loaded.configChanged = true;
        });
    }

    /** Takes a callback off a pack's `config.afterEvents.change`, when it is subscribed. */
    /**
     * Takes every subscription of a callback off a pack's `config.afterEvents.change`. With the
     * last one gone the watch stops and a change not yet delivered is dropped, so a pack that
     * subscribes again later starts from the file as it is then.
     */
    private unsubscribeConfig(loaded: LoadedPack, callback: ScriptHandle): void {
        const listeners = loaded.configListeners ?? [];
        const same = this.engine.evaluate('(a, b) => a === b');
        if (!(same instanceof ScriptHandle)) return;
        try {
            for (let index = listeners.length - 1; index >= 0; index--) {
                const listener = listeners[index];
                if (listener === undefined || this.engine.call(same, undefined, listener, callback) !== true) continue;
                listeners.splice(index, 1);
                const due = loaded.configDelivery?.remaining ?? [];
                if (due.includes(listener)) due.splice(due.indexOf(listener), 1);
                this.engine.free(listener);
            }
        } finally {
            this.engine.free(same);
        }
        if (listeners.length > 0) return;
        loaded.stopConfigWatch?.();
        loaded.stopConfigWatch = undefined;
        loaded.configChanged = false;
        loaded.configDelivery = undefined;
    }

    /**
     * Raises `config.afterEvents.change` for each pack whose file changed since the last flush,
     * with the file's value read now, so several changes in one tick give one event. Each callback
     * counts as one entry of the flush, and the ones the budget leaves run on the next flush, with
     * the value that was read, before any later change is read.
     * @param allowed - Whether the flush has room for another callback.
     * @returns How many callbacks ran.
     */
    private dispatchConfigChanges(allowed: () => boolean): number {
        const store = this.options.addonConfig;
        if (store === undefined) return 0;
        let delivered = 0;
        for (const loaded of this.loaded) {
            if (loaded.configDelivery === undefined && loaded.configChanged === true) {
                loaded.configChanged = false;
                const listeners = loaded.configListeners ?? [];
                if (listeners.length === 0) continue;
                const value = store.read(loaded.pack);
                const json = value === undefined ? undefined : JSON.stringify(value);
                loaded.configDelivery = { json, remaining: [...listeners] };
            }
            const delivery = loaded.configDelivery;
            const maker = loaded.configEventMaker;
            if (delivery === undefined || maker === undefined) continue;
            while (delivery.remaining.length > 0 && allowed()) {
                const listener = delivery.remaining.shift();
                if (listener === undefined) break;
                delivered++;
                // The event is made inside the pack's error boundary, as the callback runs.
                this.guarded(loaded, () => {
                    const event = this.engine.inContext(loaded.context, () =>
                        this.engine.call(maker, undefined, delivery.json)
                    );
                    if (!(event instanceof ScriptHandle)) return;
                    try {
                        this.invoke(loaded, listener, 'default', [event]);
                    } finally {
                        this.engine.free(event);
                    }
                });
            }
            if (delivery.remaining.length === 0) loaded.configDelivery = undefined;
        }
        return delivered;
    }

    /** What a render reads from the world, for the player the text is for. */
    private templateHost(player: string | undefined): TemplateHost {
        const world = this.options.world;
        const nameOf = (id: string): string | undefined => {
            const entity = world.entity(id);
            return entity?.name ?? (entity === undefined ? undefined : entity.nameTag);
        };
        return {
            tick: this.tick,
            placeholder: (namespace, key) => this.placeholders.value(namespace, key, player),
            score: (name, objective) => {
                const scoreboard = world.scoreboard;
                if (scoreboard.objective(objective) === undefined) return undefined;
                const ref =
                    name === '*' || name === '@s' ? (player === undefined ? undefined : { entity: player }) : { name };
                const participant = ref === undefined ? undefined : scoreboard.participant(ref);
                return participant === undefined ? undefined : scoreboard.score(objective, participant.id);
            },
            selector: (selector) => {
                // The world's own grammar, so `@a[tag=vip]` matches what a command's would.
                const matched = world.selectEntities?.(selector, player);
                if (matched === undefined) return undefined;
                return matched
                    .map(nameOf)
                    .filter((name) => name !== undefined)
                    .join(', ');
            }
        };
    }

    /**
     * Makes a pack's `@jsprismarine/placeholders` namespace in its context. The registry is the
     * runtime's, so every pack reaches it, with or without the members that reach the server.
     */
    private placeholdersNamespace(loaded: LoadedPack): ScriptHandle {
        const engine = this.engine;
        const make = engine.evaluate(placeholdersModuleSource(), '<jsprismarine/placeholders>');
        if (!(make instanceof ScriptHandle)) throw new ScriptHostErrors.NotAFunction({ what: 'The module maker' });
        const host = this.placeholdersHost(loaded);
        try {
            const namespace = engine.call(make, undefined, host);
            if (!(namespace instanceof ScriptHandle)) {
                throw new ScriptHostErrors.NotAnObject({ what: 'The @jsprismarine/placeholders namespace' });
            }
            return namespace;
        } finally {
            engine.free(make);
            engine.free(host);
        }
    }

    /** The host functions a pack's `@jsprismarine/placeholders` members call, on one object. */
    private placeholdersHost(loaded: LoadedPack): ScriptHandle {
        const engine = this.engine;
        const host = engine.evaluate('({})');
        if (!(host instanceof ScriptHandle)) {
            throw new ScriptHostErrors.NotAnObject({ what: 'The @jsprismarine/placeholders host' });
        }
        const functions: Record<
            (typeof JSPRISMARINE_PLACEHOLDERS_HOST_FUNCTIONS)[number],
            (...args: ScriptValue[]) => ScriptValue
        > = {
            register: (namespace, provider) => this.registerPlaceholders(loaded, namespace, provider),
            unregister: (id) => {
                if (typeof id === 'number') this.placeholders.unregister(id, loaded.pack);
                return undefined;
            },
            resolve: (text, value) => {
                if (typeof text !== 'string') {
                    throw new ScriptHostErrors.JspModuleArgument({
                        member: 'resolve',
                        expected: 'a string',
                        argument: 'text'
                    });
                }
                const player = value === undefined ? undefined : this.playerArgument(loaded, value, 'resolve');
                return this.placeholders.resolve(text, player?.present === true ? player.id : undefined);
            },
            namespaces: () => JSON.stringify(this.placeholders.namespaces()),
            parseTemplate: (shorthand) => {
                if (typeof shorthand !== 'string') {
                    throw new ScriptHostErrors.JspModuleArgument({
                        member: 'parse',
                        expected: 'a string',
                        argument: 'shorthand'
                    });
                }
                return JSON.stringify(parseShorthand(shorthand));
            },
            renderTemplate: (source, shorthand, value) => {
                if (typeof source !== 'string') {
                    throw new ScriptHostErrors.JspModuleArgument({
                        member: 'render',
                        expected: 'a template or a string',
                        argument: 'template'
                    });
                }
                const player = value === undefined ? undefined : this.playerArgument(loaded, value, 'render');
                const template = shorthand === true ? parseShorthand(source) : templateOf(templateJson(source));
                return JSON.stringify(
                    renderTemplate(template, this.templateHost(player?.present === true ? player.id : undefined))
                );
            }
        };
        for (const name of JSPRISMARINE_PLACEHOLDERS_HOST_FUNCTIONS) {
            const fn = engine.hostFunction(name, functions[name]);
            engine.set(host, name, fn);
            engine.free(fn);
        }
        return host;
    }

    /** The host functions behind a pack's `permissions` member. Each names the member it serves in an error. */
    private permissionFunctions(
        loaded: LoadedPack,
        playerOf: (value: ScriptValue, member: string) => FormPlayer
    ): Record<(typeof PERMISSION_HOST_FUNCTIONS)[number], (...args: ScriptValue[]) => ScriptValue> {
        const engine = this.engine;
        const permissions = () => {
            const members = this.options.members?.permissions;
            if (members === undefined) throw new ScriptHostErrors.JspMemberUnavailable({ member: 'permissions' });
            return members;
        };
        const text = (value: ScriptValue, member: string, argument: string): string => {
            if (typeof value !== 'string')
                throw new ScriptHostErrors.JspModuleArgument({ member, expected: 'a string', argument });
            return value;
        };
        const expiry = (value: ScriptValue, member: string): string | undefined =>
            value === undefined ? undefined : text(value, member, 'expires');
        /** A present player's id, or a throw naming the member: a player who left has no record to read. */
        const presentPlayer = (value: ScriptValue, member: string): string => {
            const player = playerOf(value, member);
            if (!player.present)
                throw new ScriptHostErrors.JspModuleArgument({
                    member,
                    expected: 'a Player who is online',
                    argument: 'player'
                });
            return player.id;
        };
        return {
            hasPermission: (player, node) =>
                permissions().has(presentPlayer(player, 'permissions.has'), text(node, 'permissions.has', 'node')),
            groupsOf: (player) => JSON.stringify(permissions().groupsOf(presentPlayer(player, 'permissions.groupsOf'))),
            primaryGroupOf: (player) =>
                permissions().primaryGroupOf(presentPlayer(player, 'permissions.primaryGroupOf')),
            metaOf: (player, key) =>
                permissions().metaOf(
                    presentPlayer(player, 'permissions.metaOf'),
                    text(key, 'permissions.metaOf', 'key')
                ),
            grant: (player, node, expires) => {
                const member = 'permissions.grant';
                permissions().grant(presentPlayer(player, member), text(node, member, 'node'), expiry(expires, member));
                return undefined;
            },
            revoke: (player, node) => {
                const member = 'permissions.revoke';
                permissions().revoke(presentPlayer(player, member), text(node, member, 'node'));
                return undefined;
            },
            grantToGroup: (group, node, expires) => {
                const member = 'permissions.grantToGroup';
                permissions().grantToGroup(
                    text(group, member, 'group'),
                    text(node, member, 'node'),
                    expiry(expires, member)
                );
                return undefined;
            },
            revokeFromGroup: (group, node) => {
                const member = 'permissions.revokeFromGroup';
                permissions().revokeFromGroup(text(group, member, 'group'), text(node, member, 'node'));
                return undefined;
            },
            addToGroup: (player, group, expires) => {
                const member = 'permissions.addToGroup';
                permissions().addToGroup(
                    presentPlayer(player, member),
                    text(group, member, 'group'),
                    expiry(expires, member)
                );
                return undefined;
            },
            removeFromGroup: (player, group) => {
                const member = 'permissions.removeFromGroup';
                permissions().removeFromGroup(presentPlayer(player, member), text(group, member, 'group'));
                return undefined;
            },
            onPermissionsChange: (dispatch) => {
                if (!(dispatch instanceof ScriptHandle)) return undefined;
                if (loaded.permissionsChange !== undefined) engine.free(loaded.permissionsChange);
                loaded.permissionsChange = engine.duplicate(dispatch);
                return undefined;
            }
        };
    }

    /**
     * The host functions behind `serverList`, with the loaded pack as the owner of its changes: a
     * pack that every level loads owns its changes in each level apart.
     */
    private serverListFunctions(
        loaded: LoadedPack
    ): Record<(typeof SERVER_LIST_HOST_FUNCTIONS)[number], (...args: ScriptValue[]) => ScriptValue> {
        const list = (): ScriptServerList => {
            if (this.serverList === undefined)
                throw new ScriptHostErrors.JspMemberUnavailable({ member: 'serverList' });
            return this.serverList;
        };
        return {
            serverListStatus: () => JSON.stringify(list().current()),
            updateServerList: (options) => {
                list().update(loaded, serverListOptions(this.engine, options, 'serverList.update'));
                return undefined;
            },
            resetServerList: () => {
                list().reset(loaded);
                return undefined;
            }
        };
    }

    /** The host functions behind `levels` of `@jsprismarine/server`, for one pack. */
    private levelFunctions(
        loaded: LoadedPack,
        members: JsprismarineServerMembers,
        playerOf: (value: ScriptValue, member: string) => FormPlayer
    ): Record<(typeof LEVEL_HOST_FUNCTIONS)[number], (...args: ScriptValue[]) => ScriptValue> {
        const engine = this.engine;
        const levels = () => {
            if (members.levels === undefined) throw new ScriptHostErrors.JspMemberUnavailable({ member: 'levels' });
            return members.levels;
        };
        const text = (value: ScriptValue, member: string, argument: string): string => {
            if (typeof value !== 'string')
                throw new ScriptHostErrors.JspModuleArgument({ member, expected: 'a string', argument });
            return value;
        };
        const optionalText = (value: ScriptValue, member: string, argument: string): string | undefined =>
            value === undefined ? undefined : text(value, member, argument);
        /**
         * Starts an operation whose promise the pack's module made, keeping the function that
         * settles it until the operation finishes.
         */
        const start = (settle: ScriptValue, operation: () => Promise<unknown>): undefined => {
            if (!(settle instanceof ScriptHandle)) return undefined;
            const call: LevelCall = { loaded, settle: engine.duplicate(settle) };
            this.levelCalls.add(call);
            const finish = (outcome: { readonly error?: string; readonly json?: string }) => {
                // A reload or shutdown freed the function and dropped the call.
                if (!this.levelCalls.delete(call)) return;
                this.levelSettlements.push({ call, ...outcome });
            };
            operation().then(
                (value) => finish(value === undefined ? {} : { json: JSON.stringify(value) }),
                (error: unknown) => finish({ error: error instanceof Error ? error.message : String(error) })
            );
            return undefined;
        };
        return {
            levels: () => JSON.stringify(levels().list()),
            currentLevel: () => JSON.stringify(levels().current()),
            levelOf: (value) => {
                const player = playerOf(value, 'levels.levelOf');
                const level = player.present ? levels().levelOf(player.id) : undefined;
                if (level === undefined)
                    throw new ScriptHostErrors.JspModuleArgument({
                        member: 'levels.levelOf',
                        expected: 'a Player who is online',
                        argument: 'player'
                    });
                return JSON.stringify(level);
            },
            transferPlayer: (value, level, toSpawn, settle) => {
                const member = 'levels.transfer';
                const player = playerOf(value, member);
                const name = text(level, member, 'level');
                return start(settle, () =>
                    player.present ? levels().transfer(player.id, name, toSpawn === true) : Promise.resolve(false)
                );
            },
            createLevel: (name, preset, seed, settle) => {
                const member = 'levels.create';
                const levelName = text(name, member, 'name');
                const presetName = optionalText(preset, member, 'preset');
                const seedText = optionalText(seed, member, 'seed');
                return start(settle, () => levels().create(levelName, presetName, seedText));
            },
            attachLevel: (level, settle) => {
                const name = text(level, 'levels.attach', 'level');
                return start(settle, () => levels().attach(name));
            },
            detachLevel: (level, settle) => {
                const name = text(level, 'levels.detach', 'level');
                return start(settle, () => levels().detach(name));
            }
        };
    }

    /** Settles the promises of the `levels` operations that finished since the last flush, in each pack's context. */
    private settleLevelCalls(): void {
        for (const { call, error, json } of this.levelSettlements.splice(0)) {
            this.engine.inContext(call.loaded.context, () =>
                this.guarded(call.loaded, () => void this.engine.call(call.settle, undefined, error, json))
            );
            this.engine.free(call.settle);
        }
    }

    /**
     * Tells every pack's `permissions.afterEvents.permissionsChange` subscribers of a change: the
     * group it touched, or the user's name with the pack's own object for them while they are online.
     */
    private permissionsChanged(change: ScriptPermissionsChange): void {
        if (this.stopped) return;
        // A change that arrives between flushes runs on a budget of its own, not on what the last
        // flush left; one that a script's own write raised inside a flush stays on that flush's.
        if (!this.flushing) this.engine.beginTick();
        const target = change.target;
        for (const loaded of [...this.loaded]) {
            const dispatch = loaded.permissionsChange;
            if (dispatch === undefined) continue;
            if (target === undefined) {
                this.invoke(loaded, dispatch, 'default', [undefined, undefined, undefined]);
            } else if ('group' in target) {
                this.invoke(loaded, dispatch, 'default', [target.group, undefined, undefined]);
            } else {
                const player =
                    target.player !== undefined && this.options.world.players().includes(target.player)
                        ? this.entityObject(loaded, { id: target.player, typeId: PLAYER })
                        : undefined;
                this.invoke(loaded, dispatch, 'default', [undefined, target.name, player]);
            }
        }
    }

    /**
     * `register` of `@jsprismarine/placeholders` for a pack: checks the provider's shape, keeps its `resolve` and
     * registers it under the pack, which owns the registration until it unregisters or its scripts
     * stop.
     * @returns The registration's id, which the pack's `unregister` passes back.
     */
    private registerPlaceholders(loaded: LoadedPack, namespace: ScriptValue, provider: ScriptValue): number {
        const engine = this.engine;
        const member = 'register';
        if (typeof namespace !== 'string') {
            throw new ScriptHostErrors.JspModuleArgument({ member, expected: 'a string', argument: 'namespace' });
        }
        if (!(provider instanceof ScriptHandle)) {
            throw new ScriptHostErrors.JspModuleArgument({ member, expected: 'an object', argument: 'provider' });
        }
        const keys = this.placeholderKeys(provider, member);
        const resolve = engine.get(provider, 'resolve');
        if (!(resolve instanceof ScriptHandle) || !this.isFunction(loaded, resolve)) {
            if (resolve instanceof ScriptHandle) engine.free(resolve);
            throw new ScriptHostErrors.JspModuleArgument({ member, expected: 'a function', argument: 'resolve' });
        }
        const self = engine.duplicate(provider);
        const dispose = () => {
            engine.free(self);
            engine.free(resolve);
        };
        try {
            return this.placeholders.register(loaded.pack, namespace, {
                keys,
                resolve: (key, player) => this.resolvePlaceholder(loaded, self, resolve, key, player),
                dispose
            });
        } catch (error) {
            dispose();
            throw error;
        }
    }

    /** The `keys` of a provider a pack passed, each a string. */
    private placeholderKeys(provider: ScriptHandle, member: string): string[] {
        const engine = this.engine;
        const refuse = () =>
            new ScriptHostErrors.JspModuleArgument({ member, expected: 'a list of strings', argument: 'keys' });
        const list = engine.get(provider, 'keys');
        if (!(list instanceof ScriptHandle)) throw refuse();
        /** A property's value, or a refusal, with a handle the value came as freed either way. */
        const plain = (value: ScriptValue): string | number | boolean | null | undefined => {
            if (!(value instanceof ScriptHandle)) return value;
            engine.free(value);
            throw refuse();
        };
        try {
            const length = plain(engine.get(list, 'length'));
            if (typeof length !== 'number') throw refuse();
            const keys: string[] = [];
            for (let index = 0; index < length; index++) {
                const key = plain(engine.get(list, String(index)));
                if (typeof key !== 'string') throw refuse();
                keys.push(key);
            }
            return keys;
        } finally {
            engine.free(list);
        }
    }

    /** Whether a pack's value is a function, asked in the pack's realm. */
    private isFunction(loaded: LoadedPack, value: ScriptHandle): boolean {
        const engine = this.engine;
        return engine.inContext(loaded.context, () => {
            const check = engine.evaluate('(value) => typeof value === "function"');
            if (!(check instanceof ScriptHandle)) return false;
            try {
                return engine.call(check, undefined, value) === true;
            } finally {
                engine.free(check);
            }
        });
    }

    /**
     * Calls a pack's placeholder resolver with a key and, for a player, the pack's own object for
     * them, in the pack's context as its callbacks run. A value that is not a string or a number
     * answers as undefined, which leaves the token.
     */
    private resolvePlaceholder(
        loaded: LoadedPack,
        self: ScriptHandle,
        resolve: ScriptHandle,
        key: string,
        player: string | undefined
    ): string | number | undefined {
        if (this.stopped) return undefined;
        const engine = this.engine;
        return engine.inContext(loaded.context, () => {
            const args: ScriptValue[] =
                player === undefined ? [key] : [key, this.entityObject(loaded, { id: player, typeId: PLAYER })];
            const value = engine.call(resolve, self, ...args);
            if (value instanceof ScriptHandle) {
                engine.free(value);
                return undefined;
            }
            return typeof value === 'string' || typeof value === 'number' ? value : undefined;
        });
    }

    private instance(loaded: LoadedPack, className: string, tag: number, state = ''): ScriptHandle {
        const key = `${className}\n${tag}\n${state}`;
        const existing = loaded.instances.get(key);
        if (existing !== undefined) return existing;
        const made = this.create(loaded, className, tag, state);
        loaded.instances.set(key, made);
        return made;
    }

    /**
     * The player a `Player` argument of a pack's call stands for: the entity its object carries,
     * which still names a player who left, so their object never reaches another player.
     */
    private formPlayer(loaded: LoadedPack, value: ScriptValue): FormPlayer | undefined {
        const made = loaded.api.identify(value);
        if (made?.tag !== TAG.entity) return undefined;
        const { id, typeId } = entityKeyOf(made.state);
        if (typeId !== PLAYER) return undefined;
        return { id, present: this.options.world.players().includes(id) };
    }

    /** Runs a form's settlement in the pack that made it, with the runtime's error reporting. */
    private settleInPack(loaded: LoadedPack, run: () => void): void {
        this.engine.inContext(loaded.context, () => this.guarded(loaded, run));
    }

    /**
     * Settles the forms the input step answered and those of players who left, each in its pack's
     * context, before any of this flush's promise jobs run, and frees what the forms' calls
     * returned before this flush.
     */
    private settleForms(): void {
        for (const loaded of this.loaded) loaded.forms?.releaseReturned();
        const responses = this.options.world.forms?.takeResponses() ?? [];
        const settle = (loaded: LoadedPack, run: () => void): void => this.settleInPack(loaded, run);
        this.forms.update(responses, this.options.world.players(), settle);
        this.dataDriven.update(
            this.options.world.forms?.takeDataDrivenResponses?.() ?? [],
            this.options.world.players(),
            settle
        );
    }

    /**
     * Settles the `@minecraft/server-net` requests whose results the input step admitted, each in
     * its pack's context, before any of this flush's promise jobs run.
     */
    private settleRequests(): void {
        const results = this.options.world.http?.takeResponses() ?? [];
        this.http.update(results, (loaded, settle) =>
            this.engine.inContext(loaded.context, () => this.guarded(loaded, settle))
        );
    }

    /**
     * A pack's one object for an entity. The pack keeps it while the entity lives; once the
     * pack's list of them has doubled, the objects of entities that are gone leave it, so a
     * script that still holds one keeps it and a script that asks again gets a new one.
     */
    private entityObject(loaded: LoadedPack, key: EntityKey): ScriptHandle {
        const existing = loaded.entities.get(key.id);
        if (existing !== undefined) return existing;
        if (loaded.entities.size >= this.entityPruneAt) {
            for (const [id, handle] of loaded.entities) {
                if (this.options.world.entity(id) !== undefined) continue;
                this.engine.free(handle);
                loaded.entities.delete(id);
            }
            this.entityPruneAt = Math.max(ENTITY_PRUNE_START, loaded.entities.size * 2);
        }
        const state = JSON.stringify({ id: key.id, typeId: key.typeId });
        const made =
            this.simulated.has(key.id) && loaded.modules.has(GAMETEST)
                ? loaded.api.create(GAMETEST, 'SimulatedPlayer', TAG.entity, state)
                : this.create(loaded, key.typeId === PLAYER ? 'Player' : 'Entity', TAG.entity, state);
        loaded.entities.set(key.id, made);
        return made;
    }

    private create(loaded: LoadedPack, className: string, tag: number, state = ''): ScriptHandle {
        return loaded.api.create(SERVER_MODULE, className, tag, state);
    }

    private unsubscribe(signal: SignalName, loaded: LoadedPack, callback: ScriptHandle): void {
        const same = this.engine.evaluate('(a, b) => a === b');
        if (!(same instanceof ScriptHandle)) return;
        this.subscriptions = this.subscriptions.filter((subscription) => {
            if (subscription.signal !== signal || subscription.loaded !== loaded) return true;
            if (this.engine.call(same, undefined, subscription.callback, callback) !== true) return true;
            this.engine.free(subscription.callback);
            return false;
        });
        this.engine.free(same);
    }

    /**
     * Calls every callback subscribed to a signal, in the order they subscribed, each with an
     * event object made in its own pack. One that an earlier callback unsubscribed is skipped, as
     * its handle is already freed.
     */
    private dispatch(
        signal: SignalName,
        privilege: Privilege,
        event: (loaded: LoadedPack) => ScriptHandle,
        entity?: EntityKey,
        accepts?: (filter: EntityFilter | undefined) => boolean
    ): void {
        for (const subscription of this.subscriptions.filter((each) => each.signal === signal)) {
            if (!this.subscriptions.includes(subscription)) continue;
            if (entity !== undefined && !passesFilter(subscription.filter, entity)) continue;
            if (accepts !== undefined && !accepts(subscription.filter)) continue;
            const made = event(subscription.loaded);
            this.invoke(subscription.loaded, subscription.callback, privilege, [made]);
            this.engine.free(made);
        }
    }

    private dispatchAfterEvent(event: AfterEvent): void {
        if (event.type === 'worldLoad') {
            this.dispatch('WorldLoadAfterEventSignal', 'default', (loaded) =>
                this.create(loaded, 'WorldLoadAfterEvent', 0)
            );
        } else if (event.type === 'worldInitialize') {
            this.dispatch('WorldInitializeAfterEventSignal', 'default', (loaded) =>
                this.create(loaded, 'WorldInitializeAfterEvent', 0)
            );
        } else if (event.type === 'playerJoin' || event.type === 'playerLeave') {
            const { playerId, playerName } = event;
            this.dispatchWith(
                event.type === 'playerJoin' ? 'PlayerJoinAfterEventSignal' : 'PlayerLeaveAfterEventSignal',
                event.type === 'playerJoin' ? 'PlayerJoinAfterEvent' : 'PlayerLeaveAfterEvent',
                { kind: 'playerPresence', playerId, playerName }
            );
        } else if (event.type === 'playerSpawn') {
            this.dispatchWith('PlayerSpawnAfterEventSignal', 'PlayerSpawnAfterEvent', {
                kind: 'playerSpawn',
                player: { id: event.playerId, typeId: PLAYER },
                initialSpawn: event.initialSpawn
            });
        } else if (event.type === 'chatSend') {
            this.dispatchWith('ChatSendAfterEventSignal', 'ChatSendAfterEvent', {
                kind: 'chatAfter',
                message: event.message,
                sender: event.sender
            });
        } else if (event.type === 'blockHook') {
            this.runBlockHook(event.event);
        } else if (event.type === 'itemHook') {
            this.runItemHook(event.event);
        } else if (event.type === 'scriptEvent') {
            const source = event.sourceEntity === undefined ? undefined : this.options.world.entity(event.sourceEntity);
            this.dispatchWith('ScriptEventCommandMessageAfterEventSignal', 'ScriptEventCommandMessageAfterEvent', {
                kind: 'scriptEvent',
                id: event.id,
                message: event.message,
                sourceType: event.sourceType,
                ...(source === undefined ? {} : { sourceEntity: { id: source.id, typeId: source.typeId } })
            });
        } else if (event.type === 'entitySpawn') {
            this.dispatchWith('EntitySpawnAfterEventSignal', 'EntitySpawnAfterEvent', {
                kind: 'entitySpawn',
                entity: event.entity,
                cause: event.cause
            });
        } else if (event.type === 'entityHurt') {
            this.dispatchWith(
                'EntityHurtAfterEventSignal',
                'EntityHurtAfterEvent',
                { kind: 'entityHurt', entity: event.entity, damage: event.damage, source: event.source },
                event.entity
            );
        } else if (event.type === 'entityDie') {
            this.dispatchWith(
                'EntityDieAfterEventSignal',
                'EntityDieAfterEvent',
                { kind: 'entityDie', entity: event.entity, source: event.source },
                event.entity
            );
        } else if (event.type === 'itemUse') {
            this.dispatchWith('ItemUseAfterEventSignal', 'ItemUseAfterEvent', {
                kind: 'itemUse',
                cancel: false,
                player: event.player,
                item: event.item
            });
        } else if (event.type === 'playerBreakBlock') {
            const { dimension, x, y, z } = event.block;
            this.dispatchWith('PlayerBreakBlockAfterEventSignal', 'PlayerBreakBlockAfterEvent', {
                kind: 'blockBreakAfter',
                player: event.player,
                block: { dimension, x, y, z },
                broken: event.brokenBlockPermutation,
                ...(event.itemBefore === undefined ? {} : { itemBefore: event.itemBefore }),
                ...(event.itemAfter === undefined ? {} : { itemAfter: event.itemAfter })
            });
        } else if (event.type === 'playerInteractWithBlock') {
            const { dimension, x, y, z } = event.block;
            this.dispatchWith('PlayerInteractWithBlockAfterEventSignal', 'PlayerInteractWithBlockAfterEvent', {
                kind: 'blockInteract',
                cancel: false,
                player: event.player,
                block: { dimension, x, y, z },
                face: event.face,
                faceLocation: event.faceLocation,
                ...(event.item === undefined ? {} : { item: event.item }),
                ...(event.itemAfter === undefined ? {} : { itemAfter: event.itemAfter })
            });
        } else if (event.type === 'game') {
            this.dispatchGameEvent(event, 'default');
        } else if (event.type === 'playerInteractWithEntity') {
            this.dispatchWith('PlayerInteractWithEntityAfterEventSignal', 'PlayerInteractWithEntityAfterEvent', {
                kind: 'entityInteract',
                cancel: false,
                player: event.player,
                target: { id: event.target.id, typeId: event.target.typeId },
                ...(event.item === undefined ? {} : { item: event.item }),
                ...(event.itemAfter === undefined ? {} : { itemAfter: event.itemAfter })
            });
        } else {
            const tag = this.addEvent({
                kind: 'weatherAfter',
                dimension: event.dimension.startsWith('minecraft:')
                    ? event.dimension.slice('minecraft:'.length)
                    : event.dimension,
                previousWeather: event.previousWeather,
                newWeather: event.newWeather
            });
            this.dispatch('WeatherChangeAfterEventSignal', 'default', (loaded) =>
                this.create(loaded, 'WeatherChangeAfterEvent', tag)
            );
            this.events.delete(tag);
        }
    }

    /**
     * Sends an after-event whose object reads `data`, to every subscriber of its signal.
     * @param entity - The entity the event is about, which a subscriber's `EntityEventOptions` may leave out.
     */
    private dispatchWith(signal: SignalName, className: string, data: EventData, entity?: EntityKey): void {
        if (!this.subscriptions.some((each) => each.signal === signal)) return;
        const tag = this.addEvent(data);
        this.dispatch(signal, 'default', (loaded) => this.create(loaded, className, tag), entity);
        this.events.delete(tag);
    }

    /**
     * Sends a world event of `events/worldEvents.ts` to the subscribers of its signal whose
     * options it passes.
     * @returns The event's data after the scripts ran, or undefined when no pack subscribed.
     */
    private dispatchGameEvent(event: ScriptGameEvent, privilege: Privilege): GameEventData | undefined {
        const signal = signalOfEvent(event.event);
        if (signal === undefined || !this.subscriptions.some((each) => each.signal === signal)) return undefined;
        const data = gameEventData(event);
        const tag = this.addEvent(data);
        this.dispatch(
            signal,
            privilege,
            (loaded) => this.create(loaded, event.event, tag),
            undefined,
            (filter) => passesWorldEventOptions(this.options.world, event, filter?.options)
        );
        this.events.delete(tag);
        return data;
    }

    /** The guard of every action a before-event of `events/worldEvents.ts` is about. */
    private gameEventGuard(event: ScriptGameEvent): ScriptGameEventVerdict {
        const unchanged = { veto: false, fields: event.fields } as const;
        if (this.stopped || !isBeforeEvent(event.event)) return unchanged;
        const signal = signalOfEvent(event.event);
        if (signal === undefined || !this.subscriptions.some((each) => each.signal === signal)) return unchanged;
        this.refreshClock();
        const data = this.dispatchGameEvent(event, 'restricted_execution');
        if (data === undefined) return unchanged;
        return data.cancel ? { veto: true } : { veto: false, fields: data.fields };
    }

    /** `world.beforeEvents.playerLeave`, while a player leaves and before their entity goes. */
    private playerLeaving(player: string): void {
        this.bossBars?.playerLeft(player);
        this.playerListNames?.playerLeft(player);
        if (this.stopped || !this.subscriptions.some((each) => each.signal === 'PlayerLeaveBeforeEventSignal')) return;
        this.refreshClock();
        const tag = this.addEvent({ kind: 'playerLeaving', player: { id: player, typeId: PLAYER } });
        this.dispatch('PlayerLeaveBeforeEventSignal', 'restricted_execution', (loaded) =>
            this.create(loaded, 'PlayerLeaveBeforeEvent', tag)
        );
        this.events.delete(tag);
    }

    /** The weather action's scripting guard: `world.beforeEvents.weatherChange`. */
    private weatherGuard(intent: WeatherChangeIntent) {
        if (this.stopped || !this.subscriptions.some((each) => each.signal === 'WeatherChangeBeforeEventSignal')) {
            return { veto: false, intent } as const;
        }
        this.refreshClock();
        const data: EventData = {
            kind: 'weatherBefore',
            cancel: false,
            duration: intent.duration,
            newWeather: intent.newWeather,
            previousWeather: intent.previousWeather
        };
        const tag = this.addEvent(data);
        this.dispatch('WeatherChangeBeforeEventSignal', 'restricted_execution', (loaded) =>
            this.create(loaded, 'WeatherChangeBeforeEvent', tag)
        );
        this.events.delete(tag);
        if (data.cancel) return { veto: true } as const;
        return { veto: false, intent: { ...intent, newWeather: data.newWeather, duration: data.duration } } as const;
    }

    /** The chat action's scripting guard: `world.beforeEvents.chatSend`. */
    private chatGuard(intent: ChatSendIntent): VetoVerdict {
        const { sender } = intent;
        if (
            this.stopped ||
            !this.options.world.players().includes(sender) ||
            !this.subscriptions.some((each) => each.signal === 'ChatSendBeforeEventSignal')
        ) {
            return { veto: false };
        }
        this.refreshClock();
        const data: EventData = { kind: 'chatBefore', cancel: false, message: intent.message, sender };
        const tag = this.addEvent(data);
        this.dispatch('ChatSendBeforeEventSignal', 'restricted_execution', (loaded) =>
            this.create(loaded, 'ChatSendBeforeEvent', tag)
        );
        this.events.delete(tag);
        return { veto: data.cancel };
    }

    /** The block breaking action's scripting guard: `world.beforeEvents.playerBreakBlock`. */
    private blockBreakGuard(intent: BlockBreakIntent): VetoVerdict {
        const signal = 'PlayerBreakBlockBeforeEventSignal';
        if (this.stopped || !this.subscriptions.some((each) => each.signal === signal)) return { veto: false };
        this.refreshClock();
        const { dimension, x, y, z } = intent.block;
        const data: EventData = {
            kind: 'blockBreakBefore',
            cancel: false,
            player: intent.player,
            block: { dimension, x, y, z },
            item: intent.item
        };
        return { veto: this.dispatchBefore(signal, 'PlayerBreakBlockBeforeEvent', data) };
    }

    /** The item use action's scripting guard: `world.beforeEvents.itemUse`. */
    private itemUseGuard(intent: ItemUseIntent): VetoVerdict {
        const signal = 'ItemUseBeforeEventSignal';
        if (this.stopped || !this.subscriptions.some((each) => each.signal === signal)) return { veto: false };
        this.refreshClock();
        const data: EventData = { kind: 'itemUse', cancel: false, player: intent.player, item: intent.item };
        return { veto: this.dispatchBefore(signal, 'ItemUseBeforeEvent', data) };
    }

    /** The block click action's scripting guard: `world.beforeEvents.playerInteractWithBlock`. */
    private blockInteractGuard(intent: BlockInteractIntent): VetoVerdict {
        const signal = 'PlayerInteractWithBlockBeforeEventSignal';
        if (this.stopped || !this.subscriptions.some((each) => each.signal === signal)) return { veto: false };
        this.refreshClock();
        const { dimension, x, y, z } = intent.block;
        const data: EventData = {
            kind: 'blockInteract',
            cancel: false,
            player: intent.player,
            block: { dimension, x, y, z },
            face: intent.face,
            faceLocation: intent.faceLocation,
            ...(intent.item === undefined ? {} : { item: intent.item })
        };
        return { veto: this.dispatchBefore(signal, 'PlayerInteractWithBlockBeforeEvent', data) };
    }

    /** The entity click action's scripting guard: `world.beforeEvents.playerInteractWithEntity`. */
    private entityInteractGuard(intent: EntityInteractIntent): VetoVerdict {
        const signal = 'PlayerInteractWithEntityBeforeEventSignal';
        if (this.stopped || !this.subscriptions.some((each) => each.signal === signal)) return { veto: false };
        this.refreshClock();
        const data: EventData = {
            kind: 'entityInteract',
            cancel: false,
            player: intent.player,
            target: { id: intent.target.id, typeId: intent.target.typeId },
            ...(intent.item === undefined ? {} : { item: intent.item })
        };
        return { veto: this.dispatchBefore(signal, 'PlayerInteractWithEntityBeforeEvent', data) };
    }

    /**
     * Sends a before-event whose object reads and writes `data`, in restricted execution.
     * @returns Whether a script canceled it.
     */
    private dispatchBefore(
        signal: SignalName,
        className: string,
        data: EventData & { readonly cancel: boolean }
    ): boolean {
        const tag = this.addEvent(data);
        this.dispatch(signal, 'restricted_execution', (loaded) => this.create(loaded, className, tag));
        this.events.delete(tag);
        return data.cancel;
    }

    /**
     * `system.beforeEvents.watchdogTerminate`, before a shutdown the watchdog is about to make. A
     * critical exception in one of its handlers is not sent the event again: it shuts down.
     * @returns Whether a script canceled it.
     */
    private watchdogTerminate(terminateReason: WatchdogTerminateReason): boolean {
        if (this.deliveringWatchdogTerminate) return false;
        if (!this.subscriptions.some((each) => each.signal === 'WatchdogTerminateBeforeEventSignal')) return false;
        const data: EventData = { kind: 'watchdogTerminate', cancel: false, terminateReason };
        const tag = this.addEvent(data);
        this.deliveringWatchdogTerminate = true;
        try {
            this.dispatch('WatchdogTerminateBeforeEventSignal', 'restricted_execution', (loaded) =>
                this.create(loaded, 'WatchdogTerminateBeforeEvent', tag)
            );
        } finally {
            this.deliveringWatchdogTerminate = false;
            this.events.delete(tag);
        }
        return data.cancel;
    }

    private addEvent(data: EventData): number {
        const tag = this.nextEventTag++;
        this.events.set(tag, data);
        return tag;
    }

    /**
     * Calls a GameTest's callback with the default privilege, as a system task is called, and
     * tells the runner what it threw. A `GameTestError`, such as a failed assert, fails the test
     * without reaching the content log; anything else is logged as any script error is.
     */
    private callForTest(loaded: LoadedPack, callback: ScriptHandle, args: readonly ScriptValue[]): GameTestCall {
        this.tickEntries++;
        this.lastEntered = loaded;
        let outcome: GameTestCall = { ok: false, message: 'The script stopped' };
        this.withPrivilege('default', () =>
            this.guarded(loaded, () => {
                try {
                    // In the pack's context: a promise's resolve function queues its jobs in the
                    // context it is called from, and the flush runs each pack's jobs alone.
                    const value = this.engine.inContext(loaded.context, () =>
                        this.engine.call(callback, undefined, ...args)
                    );
                    outcome = { ok: true, value };
                } catch (error) {
                    if (
                        !(error instanceof ScriptError) ||
                        error instanceof ScriptTerminatedError ||
                        error instanceof ScriptOutOfMemoryError
                    ) {
                        throw error;
                    }
                    const stack = error.scriptStack.trim();
                    const text = `${error.message}${stack === '' ? '' : `    ${stack}`}`;
                    if (error.scriptName === 'GameTestError') {
                        outcome = { ok: false, message: error.scriptMessage };
                        return;
                    }
                    this.options.log.error(`[Scripting] [${loaded.pack.name}] ${text}`);
                    outcome = { ok: false, message: text };
                }
            })
        );
        return outcome;
    }

    /** Calls `rejected` with the text of what a pack's promise rejects with, when it does. */
    private onRejected(loaded: LoadedPack, promise: ScriptHandle, rejected: (message: string) => void): void {
        const engine = this.engine;
        engine.inContext(loaded.context, () => {
            const watch = engine.evaluate(
                '(promise, rejected) => { Promise.resolve(promise).then(undefined, (error) => rejected(String(error))); }',
                '<jsp gametest>'
            );
            if (!(watch instanceof ScriptHandle)) return;
            const report = engine.hostFunction('rejected', (message) => {
                rejected(String(message));
                return undefined;
            });
            try {
                engine.call(watch, undefined, promise, report);
            } finally {
                engine.free(report);
                engine.free(watch);
            }
        });
    }

    /** Makes a promise in a pack's realm, and the functions that settle it. */
    private deferred(loaded: LoadedPack): ScriptDeferred {
        const engine = this.engine;
        return engine.inContext(loaded.context, () => {
            const list = engine.evaluate(
                '(() => { let resolve; let reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return [promise, resolve, reject]; })()',
                '<jsp gametest>'
            );
            if (!(list instanceof ScriptHandle)) throw new ScriptHostErrors.DeferredPromiseNotAList();
            try {
                const part = (index: string): ScriptHandle => {
                    const value = engine.get(list, index);
                    if (!(value instanceof ScriptHandle)) throw new ScriptHostErrors.DeferredPromiseIncomplete();
                    return value;
                };
                return { promise: part('0'), resolve: part('1'), reject: part('2') };
            } finally {
                engine.free(list);
            }
        });
    }

    /**
     * Calls one script callback in its pack's context under a privilege, logging what it throws.
     * @param self - The callback's `this`, such as the custom component a hook belongs to.
     */
    private invoke(
        loaded: LoadedPack,
        callback: ScriptHandle,
        privilege: Privilege,
        args: ScriptValue[],
        self?: ScriptHandle
    ): void {
        this.tickEntries++;
        this.lastEntered = loaded;
        this.withPrivilege(privilege, () =>
            this.guarded(loaded, () => {
                // In the pack's context, so an async callback's continuation queues with the
                // pack's promise jobs, which the flush runs, and not in another context's.
                const result = this.engine.inContext(loaded.context, () => this.engine.call(callback, self, ...args));
                if (result instanceof ScriptHandle) this.engine.free(result);
            })
        );
    }

    /**
     * Puts the custom commands the packs registered in `startup` into the world's command tree.
     * BDS registers them after `startup`, and logs and drops one whose name has an upper-case
     * letter, which the registration itself accepted.
     */
    private commitCommands(): void {
        const { commands, enums } = this.custom.commandList();
        const kept = commands.filter((command) => {
            if (command.name === command.name.toLowerCase()) return true;
            const alias = command.name.slice(command.name.indexOf(':') + 1);
            for (const prefix of [`<${command.name}>`, `<${command.name}> Alias <${alias}>`]) {
                this.options.log.error(
                    `[Commands] Register Command ${prefix} | Keywords in commands need to be lower case. '${command.name}' was not registered.`
                );
            }
            return false;
        });
        if (kept.length === 0) return;
        const release = this.options.world.registerCommands?.({
            commands: kept,
            enums,
            run: (name, origin, args) => this.runCustomCommand(name, origin, args)
        });
        if (release !== undefined) this.releaseCustom.push(release);
    }

    /**
     * Runs a custom command's callback in restricted execution, as the command runs. A callback
     * that throws fails the command with its error's message, after the content log has it.
     */
    private runCustomCommand(
        name: string,
        origin: ScriptCommandOrigin,
        args: readonly ScriptCommandArgument[]
    ): ScriptCommandOutcome {
        const registered = this.custom.command(name);
        if (registered === undefined || this.stopped) return { status: 'failure' };
        const loaded = registered.owner;
        const engine = this.engine;
        this.refreshClock();
        let outcome: ScriptCommandOutcome = { status: 'success' };
        const made: ScriptHandle[] = [];
        const values: ScriptValue[] = [];
        try {
            engine.inContext(loaded.context, () => {
                for (const value of [
                    this.create(loaded, 'CustomCommandOrigin', TAG.commandOrigin, JSON.stringify(origin)),
                    ...args.map((arg) => this.commandArgument(loaded, arg))
                ]) {
                    if (value instanceof ScriptHandle) made.push(value);
                    values.push(value);
                }
            });
            this.tickEntries++;
            this.lastEntered = loaded;
            this.withPrivilege('restricted_execution', () =>
                this.guarded(
                    loaded,
                    () => {
                        const result = engine.call(registered.callback, undefined, ...values);
                        if (!(result instanceof ScriptHandle)) return;
                        try {
                            const status = engine.get(result, 'status');
                            const message = engine.get(result, 'message');
                            outcome = {
                                status: status === 1 ? 'failure' : 'success',
                                ...(typeof message === 'string' ? { message } : {})
                            };
                        } finally {
                            engine.free(result);
                        }
                    },
                    (message) => {
                        outcome = { status: 'failure', message };
                    }
                )
            );
        } finally {
            for (const handle of made) engine.free(handle);
        }
        return outcome;
    }

    /** Makes the script value of an argument that is not a plain value, in the pack's realm. */
    private commandArgument(loaded: LoadedPack, arg: ScriptCommandArgument): ScriptValue {
        if (typeof arg !== 'object') return arg;
        const engine = this.engine;
        switch (arg.kind) {
            case 'location': {
                const { x, y, z } = arg.location;
                return engine.evaluate(`({ x: ${x}, y: ${y}, z: ${z} })`);
            }
            case 'entities': {
                const list = engine.evaluate('(...entities) => entities');
                if (!(list instanceof ScriptHandle)) return null;
                try {
                    return engine.call(
                        list,
                        undefined,
                        ...arg.entities.map((entity) => this.entityObject(loaded, entity))
                    );
                } finally {
                    engine.free(list);
                }
            }
            case 'entityType':
                return this.create(loaded, 'EntityType', TAG.entityType, arg.id);
            case 'itemType':
                return this.create(loaded, 'ItemType', TAG.itemType, arg.id);
            case 'blockType':
                return this.create(loaded, 'BlockType', TAG.blockType, arg.id);
        }
    }

    /**
     * Sends the world's custom component hooks to the packs, once every lifecycle has had its
     * chance to register components.
     */
    private bindComponents(): void {
        if (!this.custom.hasComponents()) return;
        const sink: ScriptComponentSink = {
            handlesBlock: (components, hook) => this.handles('block', components, hook),
            handlesItem: (components, hook) => this.handles('item', components, hook),
            block: (event) => {
                if (this.stopped || !this.handles('block', event.components, event.hook)) return false;
                if (BEFORE_HOOKS.has(event.hook)) {
                    this.refreshClock();
                    return this.runBlockHook(event);
                }
                this.lifecycleEvents.push({ type: 'blockHook', event });
                return false;
            },
            item: (event) => {
                if (this.stopped || !this.handles('item', event.components, event.hook)) return;
                this.lifecycleEvents.push({ type: 'itemHook', event });
            }
        };
        const release = this.options.world.bindComponents?.(sink);
        if (release !== undefined) this.releaseCustom.push(release);
    }

    /** Whether a pack registered one of the components with the hook. */
    private handles(
        kind: ComponentKind,
        components: readonly ScriptComponentUse[],
        hook: ScriptBlockHook | ScriptItemHook
    ): boolean {
        return components.some((use) => {
            if (use.legacy === true && LEGACY_SKIPPED_HOOKS.has(hook)) return false;
            return this.custom.component(kind, use.name)?.hooks.has(hook) === true;
        });
    }

    /**
     * Runs a block hook of each component the block names that has it, in the order the block
     * names them, each with its own event and parameters.
     * @returns Whether a before-hook's script canceled the action.
     */
    private runBlockHook(event: ScriptBlockHookEvent): boolean {
        return this.runHook('block', event.components, event.hook, event);
    }

    /** Runs an item hook of each component the item names that has it. */
    private runItemHook(event: ScriptItemHookEvent): void {
        this.runHook('item', event.components, event.hook, event);
    }

    private runHook(
        kind: ComponentKind,
        components: readonly ScriptComponentUse[],
        hook: ScriptBlockHook | ScriptItemHook,
        event: ScriptBlockHookEvent | ScriptItemHookEvent
    ): boolean {
        const before = BEFORE_HOOKS.has(hook);
        let canceled = false;
        for (const use of components) {
            if (use.legacy === true && LEGACY_SKIPPED_HOOKS.has(hook)) continue;
            const registered = this.custom.component(kind, use.name);
            const callback = registered?.hooks.get(hook);
            const eventClass = registered?.eventClasses.get(hook);
            if (registered === undefined || callback === undefined || eventClass === undefined) continue;
            const loaded = registered.owner;
            const made = this.create(loaded, eventClass, TAG.componentEvent, JSON.stringify(event));
            const parameters = this.create(
                loaded,
                'CustomComponentParameters',
                TAG.componentParameters,
                use.legacy === true ? '' : JSON.stringify(use.params ?? {})
            );
            try {
                this.invoke(
                    loaded,
                    callback,
                    before ? 'restricted_execution' : 'default',
                    [made, parameters],
                    registered.component
                );
                if (before) {
                    const state = loaded.api.identify(made)?.state;
                    canceled ||= state !== undefined && state !== '' && hookEventOf(state).cancel === true;
                }
            } finally {
                this.engine.free(made);
                this.engine.free(parameters);
            }
        }
        return canceled;
    }

    private withPrivilege<Result>(privilege: Privilege, run: () => Result): Result {
        const previous = this.privilege;
        this.privilege = privilege;
        try {
            return run();
        } finally {
            this.privilege = previous;
        }
    }

    /**
     * Runs one entry into the engine for a pack, and reports what went wrong as BDS does.
     * @param failed - Told the message of an error the script threw, after the content log has it.
     */
    private guarded(loaded: LoadedPack, run: () => void, failed?: (message: string) => void): void {
        if (this.stopped) return;
        const overflows = this.engine.stats().stackOverflows;
        try {
            run();
        } catch (error) {
            if (error instanceof ScriptTerminatedError) {
                this.options.log.error(`[Scripting] [${loaded.pack.name}] ${error.message}`);
                this.critical(loaded, 'Hang', `[Watchdog] Hang detected in '${loaded.pack.name}'`);
            } else if (error instanceof ScriptOutOfMemoryError) {
                this.critical(loaded, 'OutOfMemory', `[Watchdog] Out of memory exception in '${loaded.pack.name}'`);
            } else if (error instanceof ScriptError) {
                const stack = error.scriptStack.trim();
                this.options.log.error(
                    `[Scripting] [${loaded.pack.name}] ${error.message}${stack === '' ? '' : `    ${stack}`}`
                );
                failed?.(error.scriptMessage);
            } else {
                throw error;
            }
        }
        if (!this.stopped && this.engine.stats().stackOverflows > overflows) {
            this.critical(loaded, 'StackOverflow', `[Watchdog] Stack overflow detected in '${loaded.pack.name}'`);
        }
    }

    /**
     * A critical exception: BDS logs it, and shuts the server down unless the watchdog says not
     * to. Before a shutdown for a hang or a stack overflow, `system.beforeEvents.watchdogTerminate`
     * lets a script cancel it, and then BDS logs nothing more and the packs keep running. Where BDS
     * logs the unhandled exception when no script cancels is not captured; this logs it after the
     * event.
     */
    private critical(loaded: LoadedPack, kind: CriticalException, detected: string): void {
        this.options.log.error(`[Scripting] ${detected}`);
        const shutsDown = kind === 'OutOfMemory' || this.options.watchdog?.shutdown !== false;
        if (shutsDown && kind !== 'OutOfMemory' && this.watchdogTerminate(kind)) return;
        // A handler of the event above hit a critical exception of its own, which already shut down.
        if (this.stopped) return;
        this.options.log.error(
            `[Scripting] [Watchdog] Unhandled critical exception of type '${kind}' in behavior pack '${loaded.pack.name}'`
        );
        if (shutsDown) {
            this.options.log.error('[Scripting] [Watchdog] Watchdog shutting down server');
            this.stopped = true;
            // Nothing redraws a bar or a name once the scripts stop, so they go now rather than at the teardown.
            this.bossBars?.hideAll();
            this.playerListNames?.resetAll();
            this.serverList?.resetAll();
            this.options.onShutdown?.(kind);
        }
    }

    /**
     * Advances the `system.runJob` jobs one tick, within the steps the world admitted for them or
     * {@link JOB_STEPS_PER_TICK}, each step followed by the promise jobs of version 2 packs.
     */
    private runJobsOfTick(): void {
        this.lastJobSteps = 0;
        if (this.jobs.size === 0) return;
        const budget = this.options.world.jobSteps?.() ?? JOB_STEPS_PER_TICK;
        const start = this.engine.stats().tickSteps;
        this.jobs.run(
            (job) => this.stepJob(job),
            () => !this.stopped && this.engine.stats().tickSteps - start < budget,
            (job) => this.engine.free(job.callback)
        );
        this.lastJobSteps = this.engine.stats().tickSteps - start;
    }

    /**
     * The interpreter steps the jobs took in the last tick, which a host weighs against how long
     * that tick ran to size the next tick's {@link ScriptWorld.jobSteps}.
     */
    public jobStepsLastTick(): number {
        return this.lastJobSteps;
    }

    /** Calls a job's `next()` once, in its pack's context. A job that throws is logged and over. */
    private stepJob({ loaded, callback }: TaskCallback): JobStep {
        if (this.stopped) return 'done';
        this.lastEntered = loaded;
        let step: JobStep = 'done';
        this.withPrivilege('default', () =>
            this.guarded(loaded, () => {
                const result = this.engine.inContext(loaded.context, () => {
                    const next = this.engine.get(callback, 'next');
                    try {
                        if (!(next instanceof ScriptHandle)) return undefined;
                        return this.engine.call(next, callback);
                    } finally {
                        if (next instanceof ScriptHandle) this.engine.free(next);
                    }
                });
                if (!(result instanceof ScriptHandle)) return;
                const done = this.engine.get(result, 'done');
                this.engine.free(result);
                if (done instanceof ScriptHandle) this.engine.free(done);
                step = done === true ? 'done' : 'more';
            })
        );
        this.runV2Jobs();
        return step;
    }

    /** Runs a pack's promise jobs until none is left. */
    private runJobs(loaded: LoadedPack): number {
        let ran = 0;
        this.guarded(loaded, () => {
            ran += this.engine.runJobs(loaded.context);
        });
        return ran;
    }

    private runV2Jobs(): number {
        let ran = 0;
        for (const loaded of this.loaded) if (loaded.lifecycle === 2) ran += this.runJobs(loaded);
        return ran;
    }

    /** Gives every context the clock the world admitted for this tick, when it changed. */
    private refreshClock(): void {
        const clock = this.options.world.clock();
        if (clock === this.clock) return;
        this.clock = clock;
        for (const loaded of this.loaded) {
            if (loaded.setNow !== undefined) this.engine.call(loaded.setNow, undefined, clock);
        }
    }

    /** Prints how much of what the pack's scripts use is implemented (ADR 0022). */
    private reportCoverage(loaded: LoadedPack): void {
        const coverage = scanCoverage(packScripts(loaded.pack), loaded.shapes, loaded.implementations);
        const totals = loaded.shapes.map((shape) => {
            const { implemented, total } = implementationCoverage(shape, loaded.implementations);
            return `${shape.module} ${shape.version.version}: ${implemented} of ${total}`;
        });
        this.options.log.info(
            `[Scripting] [${loaded.pack.name}] uses ${coverage.used.length} Script API members, ` +
                `${coverage.implemented.length} of them implemented (${totals.join('; ')})`
        );
        if (coverage.missing.length > 0) {
            this.options.log.info(
                `[Scripting] [${loaded.pack.name}] not implemented yet: ${coverage.missing.join(', ')}`
            );
        }
    }
}

/** Which lifecycle a pack runs under: the major version of `@minecraft/server` it declares, 2 when none. */
const lifecycleOf = (pack: ScriptPack): 1 | 2 => {
    const server = pack.dependencies.find((dependency) => dependency.module_name === SERVER_MODULE);
    return server !== undefined && parseVersion(server.version)?.major === 1 ? 1 : 2;
};

/** Splits events into runs of one type, in order: the flush resolves promises after each run. */
const groupByType = (events: readonly AfterEvent[]): AfterEvent[][] => {
    const groups: AfterEvent[][] = [];
    for (const event of events) {
        const last = groups.at(-1);
        if (last?.[0]?.type === event.type) last.push(event);
        else groups.push([event]);
    }
    return groups;
};

/** How the content log writes an object a script prints: its JSON, or its class when it has none. */
const describeObject = (engine: ScriptEngine, handle: ScriptHandle): string => {
    const json = engine.evaluate('(value) => { try { return JSON.stringify(value); } catch { return undefined; } }');
    if (!(json instanceof ScriptHandle)) return '[object Object]';
    const text = engine.call(json, undefined, handle);
    engine.free(json);
    return typeof text === 'string' ? text : '[object Object]';
};
