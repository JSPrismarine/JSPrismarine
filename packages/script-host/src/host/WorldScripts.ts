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
import { ScriptError, ScriptOutOfMemoryError, ScriptTerminatedError } from '../errors';
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
import { installInputsSource, randomState } from './inputs';
import type { EventData, PackHost, SignalName, WatchdogTerminateReason } from './minecraftServer';
import { serverImplementations } from './minecraftServer';
import type { ScriptConfig, ScriptPack } from './pack';
import { packLabel, packScripts, readPackFile } from './pack';
import { TaskQueue } from './tasks';
import type {
    ChatSendIntent,
    ScriptWeather,
    ScriptWorld,
    ScriptWorldEvent,
    VetoVerdict,
    WeatherChangeIntent
} from './world';

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
    /** The world's seed, which `Math.random` is seeded from. */
    readonly seed: bigint;
    readonly watchdog?: WatchdogSettings;
    /** Asked to shut the server down after a critical exception, when the watchdog says to. */
    readonly onShutdown?: (reason: CriticalException) => void;
}

/** Where a debugger attaches to debug one pack: the world's engine and the pack's context in it. */
export interface ScriptDebugTarget {
    readonly engine: ScriptEngine;
    readonly context: ScriptContextId;
}

/** The module JSPrismarine resolves for a pack without a manifest entry (ADR 0020). */
export const JSPRISMARINE_MODULE = '@jsprismarine/server';

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
    /** Sets the clock its `Date` reads. */
    setNow?: ScriptHandle;
    jsp?: ScriptHandle;
}

/** A callback a pack subscribed to a signal. */
interface Subscription {
    readonly signal: SignalName;
    readonly loaded: LoadedPack;
    readonly callback: ScriptHandle;
}

/** A system task's callback and the pack that queued it. */
interface TaskCallback {
    readonly loaded: LoadedPack;
    readonly callback: ScriptHandle;
}

/** An after-event waiting for the flush: one the lifecycle queued, or one the world committed. */
type AfterEvent = { readonly type: 'worldLoad' } | { readonly type: 'worldInitialize' } | ScriptWorldEvent;

/** What a script's `import()` of a native module the manifest does not declare rejects with on BDS. */
const unrecognized = (name: string): ReferenceError =>
    new ReferenceError(
        `Module [${name}] is unrecognized. If this is a Native module, did you remember to add it to your manifest.json?`
    );

/** The script runtime of one world. */
export class WorldScripts {
    private readonly options: WorldScriptsOptions;
    private engine: ScriptEngine;
    private loaded: LoadedPack[] = [];
    private readonly byContext = new Map<ScriptContextId, LoadedPack>();
    private subscriptions: Subscription[] = [];
    private tasks = new TaskQueue<TaskCallback>();
    private readonly lifecycleEvents: AfterEvent[] = [];
    private readonly events = new Map<number, EventData>();
    private nextEventTag = 1;
    private privilege: Privilege = 'default';
    private tick = 0;
    private clock: number | undefined;
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
    /** The number each player id the scripts have seen got, which picks its `Player` object. */
    private readonly playerNumbers = new Map<string, number>();
    /** The pack whose callback the runtime entered last, which a tick that runs over is blamed on. */
    private lastEntered: LoadedPack | undefined;

    public constructor(options: WorldScriptsOptions) {
        this.options = options;
        this.engine = this.createEngine();
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
                this.options.world.guardChat((intent) => this.chatGuard(intent))
            ];
        }
        this.refreshClock();
        const early = this.loadPacks(2);
        this.withPrivilege('early_execution', () => {
            for (const loaded of early) this.evaluateEntry(loaded);
            for (const loaded of early) this.runJobs(loaded);
            this.dispatch('StartupBeforeEventSignal', 'early_execution', (loaded) =>
                this.create(loaded, 'StartupEvent', 0)
            );
        });
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
        this.dispatch('WorldInitializeBeforeEventSignal', 'restricted_execution', (loaded) =>
            this.create(loaded, 'WorldInitializeBeforeEvent', 0)
        );
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
        this.refreshClock();
        for (const loaded of this.loaded) if (loaded.lifecycle === 1) this.runJobs(loaded);
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
        this.tick++;
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

    private teardown(): void {
        if (!this.stopped) {
            this.dispatch('ShutdownBeforeEventSignal', 'restricted_execution', (loaded) =>
                this.create(loaded, 'ShutdownEvent', 0)
            );
        }
        this.stopped = true;
        for (const task of this.tasks.drain()) this.engine.free(task.callback.callback);
        this.tasks = new TaskQueue();
        for (const subscription of this.subscriptions) this.engine.free(subscription.callback);
        this.subscriptions = [];
        for (const loaded of this.loaded) {
            for (const handle of loaded.instances.values()) this.engine.free(handle);
            if (loaded.setNow !== undefined) this.engine.free(loaded.setNow);
            if (loaded.jsp !== undefined) this.engine.free(loaded.jsp);
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
        const allowedModules = this.options.config.module(pack.moduleUuid).allowedModules;
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
            currentTick: () => this.tick,
            schedule: (kind, callback, delay) =>
                this.tasks.schedule(kind, { loaded: self(), callback: engine.duplicate(callback) }, this.tick, delay),
            clearRun: (id) => {
                const task = this.tasks.clear(id);
                if (task !== undefined) engine.free(task.callback.callback);
            },
            subscribe: (signal, callback) =>
                this.subscriptions.push({ signal, loaded: self(), callback: engine.duplicate(callback) }),
            unsubscribe: (signal, callback) => this.unsubscribe(signal, self(), callback),
            instance: (className, tag) => this.instance(self(), className, tag),
            create: (className, tag) => this.create(self(), className, tag),
            eventData: (tag) => this.events.get(tag),
            dimensions: () => this.options.world.dimensions(),
            players: () => this.options.world.players(),
            playerNumber: (id) => this.playerNumber(id),
            sendMessage: (message) => this.options.world.sendMessage(message),
            setWeather: (dimension, weather, duration) => this.setWeather(dimension, weather, duration)
        } satisfies PackHost);
        // Made in the pack's context, so the API's classes and errors belong to the pack's realm
        // and no two packs share a prototype.
        const api = engine.inContext(
            context,
            () =>
                new ScriptApiContext(engine, {
                    pack: pack.name,
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
            modules: new Map(),
            shapes,
            instances: new Map()
        };
        const self = (): LoadedPack => entry;

        engine.inContext(context, () => {
            for (const shape of shapes) entry.modules.set(shape.module, api.bind(shape));
            this.installConsole();
            const installer = engine.evaluate(installInputsSource(), '<jsp inputs>');
            if (!(installer instanceof ScriptHandle)) throw new TypeError('The inputs installer is not a function');
            const words = randomState(this.options.seed, this.loaded.length);
            const setNow = engine.call(installer, undefined, ...words);
            engine.free(installer);
            if (setNow instanceof ScriptHandle) entry.setNow = setNow;
        });
        if (this.clock !== undefined && entry.setNow !== undefined) engine.call(entry.setNow, undefined, this.clock);

        this.loaded.push(entry);
        this.byContext.set(context, entry);
        this.reportCoverage(entry);
        return entry;
    }

    /** Gives a pack's context `console`, whose lines go to the content log under the pack's name. */
    private installConsole(): void {
        const engine = this.engine;
        const line = (args: readonly ScriptValue[]): string =>
            args.map((arg) => (arg instanceof ScriptHandle ? describeObject(engine, arg) : String(arg))).join(' ');
        const target = engine.evaluate('globalThis.console = {}');
        if (!(target instanceof ScriptHandle)) throw new TypeError('console is not an object');
        const methods: Array<[string, (message: string) => void]> = [
            ['log', (message) => this.options.log.info(message)],
            ['info', (message) => this.options.log.info(message)],
            ['debug', (message) => this.options.log.info(message)],
            ['warn', (message) => this.options.log.warn(message)],
            ['error', (message) => this.options.log.error(message)]
        ];
        for (const [name, write] of methods) {
            const fn = engine.hostFunction(name, (...args) => {
                write(`[Scripting] ${line(args)}`);
                return undefined;
            });
            engine.set(target, name, fn);
            engine.free(fn);
        }
        engine.free(target);
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
            if (loaded.jsp === undefined) {
                const namespace = this.engine.evaluate('Object.create(null)');
                if (namespace instanceof ScriptHandle) loaded.jsp = namespace;
            }
            return loaded.jsp;
        }
        if (name.startsWith('@')) throw unrecognized(name);
        return readPackFile(loaded.pack, name);
    }

    private instance(loaded: LoadedPack, className: string, tag: number): ScriptHandle {
        const key = `${className}\n${tag}`;
        const existing = loaded.instances.get(key);
        if (existing !== undefined) return existing;
        const made = this.create(loaded, className, tag);
        loaded.instances.set(key, made);
        return made;
    }

    private playerNumber(id: string): number {
        const known = this.playerNumbers.get(id);
        if (known !== undefined) return known;
        const number = this.playerNumbers.size;
        this.playerNumbers.set(id, number);
        return number;
    }

    private create(loaded: LoadedPack, className: string, tag: number): ScriptHandle {
        return loaded.api.create(SERVER_MODULE, className, tag);
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
    private dispatch(signal: SignalName, privilege: Privilege, event: (loaded: LoadedPack) => ScriptHandle): void {
        for (const subscription of this.subscriptions.filter((each) => each.signal === signal)) {
            if (!this.subscriptions.includes(subscription)) continue;
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

    private setWeather(dimension: string, weather: ScriptWeather, duration: number): void {
        this.options.world.setWeather(dimension, weather, duration);
    }

    private addEvent(data: EventData): number {
        const tag = this.nextEventTag++;
        this.events.set(tag, data);
        return tag;
    }

    /** Calls one script callback under a privilege, logging what it throws. */
    private invoke(loaded: LoadedPack, callback: ScriptHandle, privilege: Privilege, args: ScriptValue[]): void {
        this.tickEntries++;
        this.lastEntered = loaded;
        this.withPrivilege(privilege, () =>
            this.guarded(loaded, () => {
                const result = this.engine.call(callback, undefined, ...args);
                if (result instanceof ScriptHandle) this.engine.free(result);
            })
        );
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

    /** Runs one entry into the engine for a pack, and reports what went wrong as BDS does. */
    private guarded(loaded: LoadedPack, run: () => void): void {
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
            this.options.onShutdown?.(kind);
        }
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
