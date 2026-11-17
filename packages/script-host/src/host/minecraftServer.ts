/**
 * The behavior of the `@minecraft/server` members JSPrismarine implements, for one pack: the
 * system tasks, the lifecycle, the world, player, weather, chat and script events, the watchdog's
 * terminate event, dimensions, and through the modules it registers, entities and players
 * (`serverEntities.ts`), blocks (`serverBlocks.ts`), item stacks (`serverItems.ts`), dynamic
 * properties (`serverProperties.ts`), the scoreboard (`serverScoreboard.ts`), and custom
 * commands and components (`serverCustom.ts`). Every
 * other member is present and throws `NotImplementedError`
 * ([ADR 0022](../../../../docs/adr/0022-the-script-api-surface-is-generated.md)).
 *
 * It reaches the runtime and the world only through {@link PackHost}, which `WorldScripts` gives
 * each pack.
 */
import { ScriptApiError } from '../errors';
import type { ScriptEngine } from '../ScriptEngine';
import { ScriptApiImplementations } from '../shape/implementations';
import type { ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { PackCustomContent } from './customContent';
import { implementBlocks } from './serverBlocks';
import { implementCustom } from './serverCustom';
import { implementEntities } from './serverEntities';
import { implementItems } from './serverItems';
import { implementDynamicProperties } from './serverProperties';
import { implementScoreboard } from './serverScoreboard';
import type { EntityKey } from './serverObjects';
import { PLAYER, readMessage, SERVER, shortName, TAG } from './serverObjects';
import type { TaskKind } from './tasks';
import type { ScriptEventSourceType, ScriptWeather, ScriptWorld } from './world';

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
    'ChatSendAfterEventSignal',
    'WatchdogTerminateBeforeEventSignal',
    'PlayerJoinAfterEventSignal',
    'PlayerSpawnAfterEventSignal',
    'PlayerLeaveAfterEventSignal',
    'PlayerLeaveBeforeEventSignal',
    'ScriptEventCommandMessageAfterEventSignal'
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

/** A player's chat line that went out, as its after-event's members read it. */
export interface ChatAfterData {
    readonly kind: 'chatAfter';
    readonly message: string;
    /** The sender's id, as the world's players list it. */
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

/** A player who joined or left, as `PlayerJoinAfterEvent` and `PlayerLeaveAfterEvent` read them. */
export interface PlayerPresenceData {
    readonly kind: 'playerPresence';
    readonly playerId: string;
    readonly playerName: string;
}

/** A player who appeared in the world, as `PlayerSpawnAfterEvent` reads it. */
export interface PlayerSpawnData {
    readonly kind: 'playerSpawn';
    /** The player's entity, which picks their `Player` object. */
    readonly player: EntityKey;
    readonly initialSpawn: boolean;
}

/** A player about to leave, as `PlayerLeaveBeforeEvent` reads it. */
export interface PlayerLeavingData {
    readonly kind: 'playerLeaving';
    readonly player: EntityKey;
}

/** A `/scriptevent`, as `ScriptEventCommandMessageAfterEvent` reads it. */
export interface ScriptEventData {
    readonly kind: 'scriptEvent';
    readonly id: string;
    readonly message: string;
    readonly sourceType: ScriptEventSourceType;
    readonly sourceEntity?: EntityKey;
}

/** What an event object's members read, by the tag the object was made with. */
export type EventData =
    | WeatherBeforeData
    | WeatherAfterData
    | ChatBeforeData
    | ChatAfterData
    | WatchdogTerminateData
    | PlayerPresenceData
    | PlayerSpawnData
    | PlayerLeavingData
    | ScriptEventData;

/** What the members of one pack's `@minecraft/server` reach of the runtime and the world. */
export interface PackHost {
    readonly engine: ScriptEngine;
    /** The pack's header UUID, which BDS keys the world's and an entity's dynamic properties by. */
    readonly packUuid: string;
    /** The pack's script module UUID, which BDS keys an item stack's dynamic properties by. */
    readonly moduleUuid: string;
    /** The world, which the members read and write directly. */
    readonly world: ScriptWorld;
    /** `system.currentTick`. */
    currentTick(): number;
    /** Queues a system task and returns its id. */
    schedule(kind: TaskKind, callback: ScriptHandle, delay: number): number;
    clearRun(id: number): void;
    /** Adds a callback to a signal. The host keeps its own handle. */
    subscribe(signal: SignalName, callback: ScriptHandle): void;
    unsubscribe(signal: SignalName, callback: ScriptHandle): void;
    /**
     * The one instance of a class this pack gets for a tag and a state, made the first time and
     * the same object after, such as `world.afterEvents` or a dimension. The host owns the handle.
     */
    instance(className: string, tag: number, state?: string): ScriptHandle;
    /**
     * The one `Entity` or `Player` object this pack gets for an entity, the same object every
     * time, so a script can compare two with `===`. The host owns the handle.
     */
    entity(key: EntityKey): ScriptHandle;
    /** Makes a new instance for the caller, who frees or releases it. */
    create(className: string, tag: number, state?: string): ScriptHandle;
    /** The data behind an event object. */
    eventData(tag: number): EventData | undefined;
    /** The runtime's custom commands and components, which the pack registers into in `startup`. */
    readonly custom: PackCustomContent;
}

const isWeather = (value: ScriptValue): value is ScriptWeather =>
    value === 'Clear' || value === 'Rain' || value === 'Thunder';

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
            const found = host.world.dimensions().find((id) => id === requested || shortName(id) === requested);
            // BDS throws a plain Error here, as the `world-basics` scenario recorded.
            if (found === undefined)
                throw new ScriptApiError(SERVER, 'Error', `Dimension '${String(requested)}' is invalid.`);
            return host.instance('Dimension', TAG.dimension, found);
        })
        .implement(SERVER, 'World', 'sendMessage', (call) => {
            host.world.sendMessage(readMessage(call.engine, call.args[0]));
            return undefined;
        })
        .implement(SERVER, 'Dimension', 'id', { get: (call) => call.state })
        .implement(SERVER, 'Dimension', 'setWeather', (call) => {
            const [weather, duration] = call.args;
            if (!isWeather(weather)) throw new TypeError('The weather is not a WeatherType');
            host.world.setWeather(call.state, weather, typeof duration === 'number' ? Math.floor(duration) : 6000);
            return undefined;
        })
        .implement(SERVER, 'CommandResult', 'successCount', { get: (call) => Number(call.state) })
        .implement(
            SERVER,
            'SystemAfterEvents',
            'scriptEventReceive',
            signal('ScriptEventCommandMessageAfterEventSignal')
        )
        .implement(SERVER, 'WorldAfterEvents', 'playerJoin', signal('PlayerJoinAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'playerSpawn', signal('PlayerSpawnAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'playerLeave', signal('PlayerLeaveAfterEventSignal'))
        .implement(SERVER, 'WorldBeforeEvents', 'playerLeave', signal('PlayerLeaveBeforeEventSignal'))
        .implement(SERVER, 'PlayerJoinAfterEvent', 'playerId', { get: (call) => data(call, 'playerPresence').playerId })
        .implement(SERVER, 'PlayerJoinAfterEvent', 'playerName', {
            get: (call) => data(call, 'playerPresence').playerName
        })
        .implement(SERVER, 'PlayerLeaveAfterEvent', 'playerId', {
            get: (call) => data(call, 'playerPresence').playerId
        })
        .implement(SERVER, 'PlayerLeaveAfterEvent', 'playerName', {
            get: (call) => data(call, 'playerPresence').playerName
        })
        .implement(SERVER, 'PlayerSpawnAfterEvent', 'initialSpawn', {
            get: (call) => data(call, 'playerSpawn').initialSpawn
        })
        .implement(SERVER, 'PlayerSpawnAfterEvent', 'player', {
            get: (call) => host.entity(data(call, 'playerSpawn').player)
        })
        .implement(SERVER, 'PlayerLeaveBeforeEvent', 'player', {
            get: (call) => host.entity(data(call, 'playerLeaving').player)
        })
        .implement(SERVER, 'ScriptEventCommandMessageAfterEvent', 'id', { get: (call) => data(call, 'scriptEvent').id })
        .implement(SERVER, 'ScriptEventCommandMessageAfterEvent', 'message', {
            get: (call) => data(call, 'scriptEvent').message
        })
        .implement(SERVER, 'ScriptEventCommandMessageAfterEvent', 'sourceType', {
            get: (call) => data(call, 'scriptEvent').sourceType
        })
        .implement(SERVER, 'ScriptEventCommandMessageAfterEvent', 'sourceEntity', {
            get: (call) => {
                const source = data(call, 'scriptEvent').sourceEntity;
                return source === undefined ? undefined : host.entity(source);
            }
        })
        // No block or NPC sends a /scriptevent on JSPrismarine yet, and the initiator is an NPC's talker.
        .implement(SERVER, 'ScriptEventCommandMessageAfterEvent', 'sourceBlock', { get: () => undefined })
        .implement(SERVER, 'ScriptEventCommandMessageAfterEvent', 'initiator', { get: () => undefined })
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
            get: (call) => host.entity({ id: data(call, 'chatBefore').sender, typeId: PLAYER })
        })
        // A line typed in chat goes to everyone; only a line a script sends has targets.
        .implement(SERVER, 'ChatSendBeforeEvent', 'targets', { get: () => undefined })
        .implement(SERVER, 'WorldAfterEvents', 'chatSend', signal('ChatSendAfterEventSignal'))
        .implement(SERVER, 'ChatSendAfterEvent', 'message', { get: (call) => data(call, 'chatAfter').message })
        .implement(SERVER, 'ChatSendAfterEvent', 'sender', {
            get: (call) => host.entity({ id: data(call, 'chatAfter').sender, typeId: PLAYER })
        })
        .implement(SERVER, 'ChatSendAfterEvent', 'targets', { get: () => undefined })
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

    implementEntities(implementations, host);
    implementBlocks(implementations, host);
    implementItems(implementations, host);
    implementDynamicProperties(implementations, host);
    implementScoreboard(implementations, host);
    implementCustom(implementations, host);
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
