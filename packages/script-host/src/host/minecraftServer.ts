/**
 * The behavior of the `@minecraft/server` members the skeleton implements, for one pack: the
 * system tasks, the lifecycle, weather and chat events, the watchdog's terminate event, `world.getDimension`, `world.sendMessage`,
 * `world.getAllPlayers`, `Dimension.setWeather` and the members those return. Every other member
 * is present and throws `NotImplementedError` ([ADR 0022](../../../../docs/adr/0022-the-script-api-surface-is-generated.md)).
 *
 * It reaches the runtime and the world only through {@link PackHost}, which `WorldScripts` gives
 * each pack.
 */
import { engineFunctionSource } from '../engineSource';
import { ScriptApiError } from '../errors';
import type { ScriptEngine } from '../ScriptEngine';
import { ScriptApiImplementations } from '../shape/implementations';
import type { ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { TaskKind } from './tasks';
import type { ScriptWeather } from './world';

const SERVER = '@minecraft/server';

/** The event signals a pack can subscribe to, by the class the Script API gives each. */
export const SIGNALS = [
    'StartupBeforeEventSignal',
    'ShutdownBeforeEventSignal',
    'WorldLoadAfterEventSignal',
    'WorldInitializeBeforeEventSignal',
    'WorldInitializeAfterEventSignal',
    'WeatherChangeBeforeEventSignal',
    'WeatherChangeAfterEventSignal',
    'ChatSendBeforeEventSignal',
    'WatchdogTerminateBeforeEventSignal'
] as const;

/** One of {@link SIGNALS}. */
export type SignalName = (typeof SIGNALS)[number];

/** A weather change as its before-event's members read and write it. */
export interface WeatherBeforeData {
    readonly kind: 'weatherBefore';
    cancel: boolean;
    duration: number;
    newWeather: ScriptWeather;
    readonly previousWeather: ScriptWeather;
}

/** A committed weather change as its after-event's members read it. */
export interface WeatherAfterData {
    readonly kind: 'weatherAfter';
    /** The dimension as the after-event names it, without a namespace, such as `overworld`. */
    readonly dimension: string;
    readonly newWeather: ScriptWeather;
    readonly previousWeather: ScriptWeather;
}

/** A player's chat line as its before-event's members read and write it. */
export interface ChatBeforeData {
    readonly kind: 'chatBefore';
    cancel: boolean;
    readonly message: string;
    /** The sender's id, as the world's players list it, which picks their `Player` object. */
    readonly sender: string;
}

/** Why the watchdog would shut the server down, as `WatchdogTerminateReason` names it. */
export type WatchdogTerminateReason = 'Hang' | 'StackOverflow';

/** A shutdown the watchdog is about to make, as its before-event's members read and write it. */
export interface WatchdogTerminateData {
    readonly kind: 'watchdogTerminate';
    cancel: boolean;
    readonly terminateReason: WatchdogTerminateReason;
}

/** What an event object's members read, by the tag the object was made with. */
export type EventData = WeatherBeforeData | WeatherAfterData | ChatBeforeData | WatchdogTerminateData;

/** What the members of one pack's `@minecraft/server` reach of the runtime and the world. */
export interface PackHost {
    readonly engine: ScriptEngine;
    /** `system.currentTick`. */
    currentTick(): number;
    /** Queues a system task and returns its id. */
    schedule(kind: TaskKind, callback: ScriptHandle, delay: number): number;
    clearRun(id: number): void;
    /** Adds a callback to a signal. The host keeps its own handle. */
    subscribe(signal: SignalName, callback: ScriptHandle): void;
    unsubscribe(signal: SignalName, callback: ScriptHandle): void;
    /**
     * The one instance of a class this pack gets for a tag, made the first time and the same
     * object after, such as `world.afterEvents` or a dimension. The host owns the handle.
     */
    instance(className: string, tag: number): ScriptHandle;
    /** Makes a new instance for the caller, who frees it. */
    create(className: string, tag: number): ScriptHandle;
    /** The data behind an event object. */
    eventData(tag: number): EventData | undefined;
    dimensions(): readonly string[];
    players(): readonly string[];
    /**
     * A number for a player id, from 0: the same for one id every time, and never one another id
     * had, so a player who takes a leaving player's place gets a `Player` object of their own.
     */
    playerNumber(id: string): number;
    sendMessage(message: string): void;
    setWeather(dimension: string, weather: ScriptWeather, duration: number): void;
}

/** The tags of the singleton objects a pack's members return. */
const TAG = {
    worldAfterEvents: 1,
    worldBeforeEvents: 2,
    systemAfterEvents: 3,
    systemBeforeEvents: 4,
    gameRules: 5,
    /** A signal's tag is this plus its index in {@link SIGNALS}. */
    signal: 100,
    /** A dimension's tag is this plus its index in the world's dimensions. */
    dimension: 1000,
    /** A player's tag is this plus the number {@link PackHost.playerNumber} gives their id. */
    player: 100000
} as const;

/** What `Dimension.id` accepts besides the full id: the name without `minecraft:`. */
const shortName = (id: string): string => (id.startsWith('minecraft:') ? id.slice('minecraft:'.length) : id);

const isWeather = (value: ScriptValue): value is ScriptWeather =>
    value === 'Clear' || value === 'Rain' || value === 'Thunder';

/**
 * The text of a `sendMessage` argument: a string, a `RawMessage` or a list of either. It runs
 * inside the pack's engine, never in Node.js, so the watchdog counts each element it visits and a
 * list whose `length` never ends stops at the step budget. It must not refer to anything outside
 * its own body.
 */
function messageText(value: unknown): string {
    // biome-ignore lint/suspicious/noRedundantUseStrict: the engine runs this source as a script, which is sloppy unless it says otherwise.
    'use strict';
    const text = (part: unknown): string => {
        if (typeof part === 'string') return part;
        if (typeof part !== 'object' || part === null) return '';
        // Any object a script passed; the binding checked only that it is one.
        const message = part as Readonly<Record<PropertyKey, unknown>>;
        const { length } = message;
        if (typeof length === 'number') {
            let joined = '';
            for (let index = 0; index < length; index++) joined += text(message[index]);
            return joined;
        }
        if (typeof message.text === 'string') return message.text;
        if (typeof message.translate === 'string') return message.translate;
        return text(message.rawtext);
    };
    return text(value);
}

/** The source text that evaluates, inside an engine, to {@link messageText}. */
const messageTextSource = (): string => engineFunctionSource(messageText.toString());

/**
 * The implementations of one pack's `@minecraft/server`.
 * @param host - The pack's view of the runtime and the world.
 */
export const serverImplementations = (host: PackHost): ScriptApiImplementations => {
    const callbackOf = (call: ScriptCall): ScriptHandle => {
        const [callback] = call.args;
        // The binding checked the argument against its closure type.
        if (!(callback instanceof ScriptHandle)) throw new TypeError('The callback is not a function');
        return callback;
    };
    const delayOf = (call: ScriptCall): number => {
        const delay = call.args[1];
        return typeof delay === 'number' ? delay : 0;
    };
    const dimensionAt = (call: ScriptCall): string => {
        const dimension = host.dimensions()[call.tag - TAG.dimension];
        if (dimension === undefined) throw new ReferenceError('The dimension no longer exists');
        return dimension;
    };
    const data = <Kind extends EventData['kind']>(call: ScriptCall, kind: Kind): Extract<EventData, { kind: Kind }> => {
        const found = host.eventData(call.tag);
        if (found?.kind !== kind) throw new ReferenceError('The event is no longer valid');
        // Narrowed by its kind, which the compiler cannot carry through the generic Extract.
        return found as Extract<EventData, { kind: Kind }>;
    };
    const signal = (name: SignalName) => ({ get: () => host.instance(name, TAG.signal + SIGNALS.indexOf(name)) });

    const implementations = new ScriptApiImplementations()
        .implement(SERVER, 'System', 'run', (call) => host.schedule('run', callbackOf(call), 0))
        .implement(SERVER, 'System', 'runTimeout', (call) => host.schedule('timeout', callbackOf(call), delayOf(call)))
        .implement(SERVER, 'System', 'runInterval', (call) =>
            host.schedule('interval', callbackOf(call), delayOf(call))
        )
        .implement(SERVER, 'System', 'clearRun', (call) => {
            const [id] = call.args;
            if (typeof id === 'number') host.clearRun(id);
            return undefined;
        })
        .implement(SERVER, 'System', 'currentTick', { get: () => host.currentTick() })
        .implement(SERVER, 'System', 'afterEvents', {
            get: () => host.instance('SystemAfterEvents', TAG.systemAfterEvents)
        })
        .implement(SERVER, 'System', 'beforeEvents', {
            get: () => host.instance('SystemBeforeEvents', TAG.systemBeforeEvents)
        })
        .implement(SERVER, 'SystemBeforeEvents', 'startup', signal('StartupBeforeEventSignal'))
        .implement(SERVER, 'SystemBeforeEvents', 'shutdown', signal('ShutdownBeforeEventSignal'))
        .implement(SERVER, 'World', 'afterEvents', {
            get: () => host.instance('WorldAfterEvents', TAG.worldAfterEvents)
        })
        .implement(SERVER, 'World', 'beforeEvents', {
            get: () => host.instance('WorldBeforeEvents', TAG.worldBeforeEvents)
        })
        .implement(SERVER, 'WorldAfterEvents', 'worldLoad', signal('WorldLoadAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'worldInitialize', signal('WorldInitializeAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'weatherChange', signal('WeatherChangeAfterEventSignal'))
        .implement(SERVER, 'WorldBeforeEvents', 'worldInitialize', signal('WorldInitializeBeforeEventSignal'))
        .implement(SERVER, 'WorldBeforeEvents', 'weatherChange', signal('WeatherChangeBeforeEventSignal'))
        .implement(SERVER, 'WorldBeforeEvents', 'chatSend', signal('ChatSendBeforeEventSignal'))
        .implement(SERVER, 'SystemBeforeEvents', 'watchdogTerminate', signal('WatchdogTerminateBeforeEventSignal'))
        .implement(SERVER, 'World', 'gameRules', { get: () => host.instance('GameRules', TAG.gameRules) })
        .implement(SERVER, 'World', 'getDimension', (call) => {
            const [requested] = call.args;
            const index = host.dimensions().findIndex((id) => id === requested || shortName(id) === requested);
            if (index < 0) {
                throw new ScriptApiError(
                    '@minecraft/common',
                    'InvalidArgumentError',
                    `Dimension '${String(requested)}' is invalid`
                );
            }
            return host.instance('Dimension', TAG.dimension + index);
        })
        .implement(SERVER, 'World', 'getAllPlayers', (call) => {
            const array = call.engine.evaluate('[]');
            if (!(array instanceof ScriptHandle)) throw new TypeError('An array literal evaluated to a primitive');
            host.players().forEach((id, index) => {
                const player = host.instance('Player', TAG.player + host.playerNumber(id));
                call.engine.set(array, String(index), player);
            });
            return array;
        })
        .implement(SERVER, 'World', 'sendMessage', (call) => {
            const walk = call.engine.evaluate(messageTextSource(), '<jsp sendMessage>');
            if (!(walk instanceof ScriptHandle)) throw new TypeError('The message walk is not a function');
            try {
                const text = call.engine.call(walk, undefined, call.args[0]);
                host.sendMessage(typeof text === 'string' ? text : '');
            } finally {
                call.engine.free(walk);
            }
            return undefined;
        })
        .implement(SERVER, 'Dimension', 'id', { get: (call) => dimensionAt(call) })
        .implement(SERVER, 'Dimension', 'setWeather', (call) => {
            const [weather, duration] = call.args;
            if (!isWeather(weather)) throw new TypeError('The weather is not a WeatherType');
            host.setWeather(dimensionAt(call), weather, typeof duration === 'number' ? Math.floor(duration) : 6000);
            return undefined;
        })
        .implement(SERVER, 'WeatherChangeBeforeEvent', 'cancel', {
            get: (call) => data(call, 'weatherBefore').cancel,
            set: (call) => {
                data(call, 'weatherBefore').cancel = call.args[0] === true;
            }
        })
        .implement(SERVER, 'WeatherChangeBeforeEvent', 'duration', {
            get: (call) => data(call, 'weatherBefore').duration,
            set: (call) => {
                const [duration] = call.args;
                if (typeof duration === 'number') data(call, 'weatherBefore').duration = Math.floor(duration);
            }
        })
        .implement(SERVER, 'WeatherChangeBeforeEvent', 'newWeather', {
            get: (call) => data(call, 'weatherBefore').newWeather,
            set: (call) => {
                const [weather] = call.args;
                if (isWeather(weather)) data(call, 'weatherBefore').newWeather = weather;
            }
        })
        .implement(SERVER, 'WeatherChangeBeforeEvent', 'previousWeather', {
            get: (call) => data(call, 'weatherBefore').previousWeather
        })
        .implement(SERVER, 'ChatSendBeforeEvent', 'cancel', {
            get: (call) => data(call, 'chatBefore').cancel,
            set: (call) => {
                data(call, 'chatBefore').cancel = call.args[0] === true;
            }
        })
        .implement(SERVER, 'ChatSendBeforeEvent', 'message', { get: (call) => data(call, 'chatBefore').message })
        .implement(SERVER, 'ChatSendBeforeEvent', 'sender', {
            get: (call) => host.instance('Player', TAG.player + host.playerNumber(data(call, 'chatBefore').sender))
        })
        .implement(SERVER, 'WatchdogTerminateBeforeEvent', 'cancel', {
            get: (call) => data(call, 'watchdogTerminate').cancel,
            set: (call) => {
                data(call, 'watchdogTerminate').cancel = call.args[0] === true;
            }
        })
        .implement(SERVER, 'WatchdogTerminateBeforeEvent', 'terminateReason', {
            get: (call) => data(call, 'watchdogTerminate').terminateReason
        })
        .implement(SERVER, 'WeatherChangeAfterEvent', 'dimension', {
            get: (call) => data(call, 'weatherAfter').dimension
        })
        .implement(SERVER, 'WeatherChangeAfterEvent', 'newWeather', {
            get: (call) => data(call, 'weatherAfter').newWeather
        })
        .implement(SERVER, 'WeatherChangeAfterEvent', 'previousWeather', {
            get: (call) => data(call, 'weatherAfter').previousWeather
        });

    for (const name of SIGNALS) {
        implementations
            .implement(SERVER, name, 'subscribe', (call) => {
                const callback = callbackOf(call);
                host.subscribe(name, callback);
                return callback;
            })
            .implement(SERVER, name, 'unsubscribe', (call) => {
                host.unsubscribe(name, callbackOf(call));
                return undefined;
            });
    }
    return implementations;
};
