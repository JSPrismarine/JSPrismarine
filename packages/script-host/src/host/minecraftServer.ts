/**
 * The behavior of the `@minecraft/server` members JSPrismarine implements, for one pack: the
 * system tasks, the lifecycle, the world, player, entity, weather, chat and script events, the watchdog's
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
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../errors';
import type { ScriptEngine } from '../ScriptEngine';
import { ScriptApiImplementations } from '../shape/implementations';
import type { ScriptCall } from '../shape/implementations';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { PackCustomContent } from './customContent';
import type { DebugPackHost } from './debugUtilities';
import { implementBlocks } from './serverBlocks';
import { implementComponents } from './serverComponents';
import { implementCustom } from './serverCustom';
import { implementEntityArea } from './entities/area';
import { implementEntities } from './serverEntities';
import { implementItems } from './serverItems';
import { implementDynamicProperties } from './serverProperties';
import { implementScoreboard } from './serverScoreboard';
import { implementStructures } from './serverStructures';
import { implementFeedback } from './serverFeedback';
import { implementBlocksAndItems } from './blocksItems/implement';
import type { WorldEventOptions } from './events/eventOptions';
import { worldEventOptionsOf } from './events/eventOptions';
import type { GameEventData } from './events/eventValues';
import { damageSourceObject } from './events/eventValues';
import { implementWorldEvents, WORLD_EVENT_SIGNALS } from './events/worldEvents';
import { implementComponentEvents } from './events/componentEvents';
import { implementDimension } from './worldsystem/serverDimension';
import { implementClocks } from './worldsystem/serverClocks';
import { implementFog } from './worldsystem/serverFog';
import { implementVolumes } from './worldsystem/serverVolumes';
import { implementLoot } from './worldsystem/serverLoot';
import { implementPrimitiveShapes } from './worldsystem/serverPrimitiveShapes';
import { implementTickingAreas } from './worldsystem/serverTickingAreas';
import { implementWorldSettings } from './worldsystem/serverWorld';
import type { BlockKey, EntityKey } from './serverObjects';
import {
    entityKeyOf,
    itemOf,
    itemState,
    PLAYER,
    readMessage,
    SERVER,
    shortName,
    TAG,
    withNamespace
} from './serverObjects';
import type { TaskKind } from './tasks';
import type {
    ScriptBlockPermutation,
    ScriptDamageSource,
    ScriptDirection,
    ScriptVector3,
    ScriptEventSourceType,
    ScriptGameEvent,
    ScriptItem,
    ScriptSpawnCause,
    ScriptWeather,
    ScriptWorld
} from './world';

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
    'ScriptEventCommandMessageAfterEventSignal',
    'EntitySpawnAfterEventSignal',
    'EntityHurtAfterEventSignal',
    'EntityDieAfterEventSignal',
    'ItemUseBeforeEventSignal',
    'ItemUseAfterEventSignal',
    'PlayerBreakBlockBeforeEventSignal',
    'PlayerBreakBlockAfterEventSignal',
    'PlayerInteractWithBlockBeforeEventSignal',
    'PlayerInteractWithBlockAfterEventSignal',
    'PlayerInteractWithEntityBeforeEventSignal',
    'PlayerInteractWithEntityAfterEventSignal',
    ...WORLD_EVENT_SIGNALS
] as const;

/** The signals whose `subscribe` takes `EntityEventOptions`, which pick the entities whose events a callback gets. */
export const ENTITY_FILTERED_SIGNALS: ReadonlySet<SignalName> = new Set<SignalName>([
    'EntityHurtAfterEventSignal',
    'EntityDieAfterEventSignal'
]);

/**
 * The entities a subscriber of an entity event asked for, by `EntityEventOptions`. An entity's
 * event reaches it when it is one of `entities` and its type is one of `entityTypes`, for each
 * list given; an empty list matches none, and a type is matched as written, without a namespace
 * added, as the `entity-event-options` scenario recorded.
 */
export interface EntityFilter {
    readonly entities?: readonly string[];
    readonly entityTypes?: readonly string[];
    /** The options of a world event signal of `events/worldEvents.ts`, which that module matches. */
    readonly options?: WorldEventOptions;
}

/** Whether an entity's event reaches a subscriber with a filter. */
export const passesFilter = (filter: EntityFilter | undefined, entity: EntityKey): boolean =>
    filter === undefined ||
    ((filter.entities === undefined || filter.entities.includes(entity.id)) &&
        (filter.entityTypes === undefined || filter.entityTypes.includes(entity.typeId)));

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

/** An entity that appeared, as `EntitySpawnAfterEvent` reads it. */
export interface EntitySpawnData {
    readonly kind: 'entitySpawn';
    readonly entity: EntityKey;
    readonly cause: ScriptSpawnCause;
}

/** A blow that took health, as `EntityHurtAfterEvent` reads it. */
export interface EntityHurtData {
    readonly kind: 'entityHurt';
    readonly entity: EntityKey;
    readonly damage: number;
    readonly source: ScriptDamageSource;
}

/** An entity that died, as `EntityDieAfterEvent` reads it. */
export interface EntityDieData {
    readonly kind: 'entityDie';
    readonly entity: EntityKey;
    readonly source: ScriptDamageSource;
}

/** An item a player uses, as `ItemUseBeforeEvent` and `ItemUseAfterEvent` read it. */
export interface ItemUseData {
    readonly kind: 'itemUse';
    /** Whether a before-event's script canceled it; always false for an after-event. */
    cancel: boolean;
    /** The player's id, as the world's players list it. */
    readonly player: string;
    item: ScriptItem;
}

/** A block a player is about to break, as `PlayerBreakBlockBeforeEvent` reads and writes it. */
export interface BlockBreakBeforeData {
    readonly kind: 'blockBreakBefore';
    cancel: boolean;
    readonly player: string;
    readonly block: BlockKey;
    /** The stack in the player's hand, which a script may replace. Absent for an empty hand. */
    item: ScriptItem | undefined;
}

/** A block a player broke, as `PlayerBreakBlockAfterEvent` reads it. */
export interface BlockBreakAfterData {
    readonly kind: 'blockBreakAfter';
    readonly player: string;
    readonly block: BlockKey;
    readonly broken: ScriptBlockPermutation;
    readonly itemBefore?: ScriptItem;
    readonly itemAfter?: ScriptItem;
}

/**
 * A player's click on a block, as `PlayerInteractWithBlockBeforeEvent` reads and writes it and
 * `PlayerInteractWithBlockAfterEvent` reads it.
 */
export interface BlockInteractData {
    readonly kind: 'blockInteract';
    /** Whether a before-event's script canceled it; always false for an after-event. */
    cancel: boolean;
    readonly player: string;
    readonly block: BlockKey;
    readonly face: ScriptDirection;
    readonly faceLocation: ScriptVector3;
    /** The stack in the player's hand before the click. Absent for an empty hand. */
    readonly item?: ScriptItem;
    /** The stack in the player's hand after the click, for an after-event. Absent for an empty hand. */
    readonly itemAfter?: ScriptItem;
}

/**
 * A player's click on an entity, as `PlayerInteractWithEntityBeforeEvent` reads and writes it and
 * `PlayerInteractWithEntityAfterEvent` reads it.
 */
export interface EntityInteractData {
    readonly kind: 'entityInteract';
    cancel: boolean;
    readonly player: string;
    readonly target: EntityKey;
    readonly item?: ScriptItem;
    readonly itemAfter?: ScriptItem;
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
    | ScriptEventData
    | EntitySpawnData
    | EntityHurtData
    | EntityDieData
    | ItemUseData
    | BlockBreakBeforeData
    | BlockBreakAfterData
    | BlockInteractData
    | EntityInteractData
    | GameEventData;

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
    /** Queues a `system.runJob` generator and returns the job's id. */
    runJob(generator: ScriptHandle): number;
    clearJob(id: number): void;
    /**
     * Adds a callback to a signal. The host keeps its own handle.
     * @param filter - The entities an entity event's callback gets, from its `EntityEventOptions`.
     */
    subscribe(signal: SignalName, callback: ScriptHandle, filter?: EntityFilter): void;
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
    /**
     * The pack's debug shape drawer and what its shapes reach, which `world.primitiveShapesManager`
     * draws through. Read when a member runs, since it is made after the implementations.
     */
    readonly debugShapes?: () => DebugPackHost | undefined;
    /**
     * One of `@minecraft/server`'s exports in the pack's realm, such as a class whose constructor
     * a member runs, or undefined when the pack has not bound the module. The caller frees it.
     */
    readonly serverExport?: (name: string) => ScriptValue | undefined;
    /**
     * Queues an after-event the scripts themselves caused, such as a change of a player's input
     * permissions, for the next script flush, beside the ones the world commits.
     */
    readonly raise?: (event: ScriptGameEvent) => void;
}

/** Whether a value is a generator object, as `system.runJob` takes one. */
const isGenerator = (engine: ScriptEngine, value: ScriptHandle): boolean => {
    const check = engine.evaluate(
        '(value) => Object.prototype.toString.call(value) === "[object Generator]"',
        '<jsp runJob>'
    );
    if (!(check instanceof ScriptHandle)) return false;
    try {
        return engine.call(check, undefined, value) === true;
    } finally {
        engine.free(check);
    }
};

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
        if (!(callback instanceof ScriptHandle)) throw new ScriptHostErrors.NotAFunction({ what: 'The callback' });
        return callback;
    };
    const delayOf = (call: ScriptCall): number => {
        const delay = call.args[1];
        return typeof delay === 'number' ? delay : 0;
    };
    const data = <Kind extends EventData['kind']>(call: ScriptCall, kind: Kind): Extract<EventData, { kind: Kind }> => {
        const found = host.eventData(call.tag);
        if (found?.kind !== kind) throw new ScriptHostErrors.EventNoLongerValid();
        // Narrowed by its kind, which the compiler cannot carry through the generic Extract.
        return found as Extract<EventData, { kind: Kind }>;
    };
    const signal = (name: SignalName) => ({ get: () => host.instance(name, TAG.signal + SIGNALS.indexOf(name)) });
    const damageSource = (source: ScriptDamageSource): ScriptHandle => damageSourceObject(host, source);

    const dimensionTypes = (): readonly string[] => host.world.dimensionTypes?.() ?? host.world.dimensions();

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
        .implement(SERVER, 'System', 'runJob', (call) => {
            const [generator] = call.args;
            if (!(generator instanceof ScriptHandle) || !isGenerator(call.engine, generator)) {
                throw new ScriptHostErrors.ArgumentConversionFailed({
                    index: 0,
                    expected: 'Generator<void, void, void>'
                });
            }
            return host.runJob(generator);
        })
        .implement(SERVER, 'System', 'clearJob', (call) => {
            const [id] = call.args;
            if (typeof id === 'number') host.clearJob(id);
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
        .implement(SERVER, 'DimensionTypes', 'getAll', () => {
            const array = host.engine.evaluate('[]');
            if (!(array instanceof ScriptHandle))
                throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
            dimensionTypes().forEach((id, index) => {
                const type = host.create('DimensionType', TAG.dimensionType, id);
                host.engine.set(array, String(index), type);
                host.engine.free(type);
            });
            return host.engine.release(array);
        })
        .implement(SERVER, 'DimensionTypes', 'get', (call) => {
            const id = withNamespace(String(call.args[0]));
            if (!dimensionTypes().includes(id)) return undefined;
            return host.engine.release(host.create('DimensionType', TAG.dimensionType, id));
        })
        .implement(SERVER, 'DimensionType', 'typeId', { get: (call) => call.state })
        .implement(SERVER, 'Dimension', 'setWeather', (call) => {
            const [weather, duration] = call.args;
            if (!isWeather(weather))
                throw new ScriptHostErrors.ArgumentNotOfType({ argument: 'weather', type: 'WeatherType' });
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
        .implement(SERVER, 'WorldAfterEvents', 'entitySpawn', signal('EntitySpawnAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'entityHurt', signal('EntityHurtAfterEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'entityDie', signal('EntityDieAfterEventSignal'))
        .implement(SERVER, 'EntitySpawnAfterEvent', 'entity', {
            get: (call) => host.entity(data(call, 'entitySpawn').entity)
        })
        .implement(SERVER, 'EntitySpawnAfterEvent', 'cause', { get: (call) => data(call, 'entitySpawn').cause })
        .implement(SERVER, 'EntityHurtAfterEvent', 'hurtEntity', {
            get: (call) => host.entity(data(call, 'entityHurt').entity)
        })
        .implement(SERVER, 'EntityHurtAfterEvent', 'damage', { get: (call) => data(call, 'entityHurt').damage })
        .implement(SERVER, 'EntityHurtAfterEvent', 'damageSource', {
            get: (call) => damageSource(data(call, 'entityHurt').source)
        })
        .implement(SERVER, 'EntityDieAfterEvent', 'deadEntity', {
            get: (call) => host.entity(data(call, 'entityDie').entity)
        })
        .implement(SERVER, 'EntityDieAfterEvent', 'damageSource', {
            get: (call) => damageSource(data(call, 'entityDie').source)
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
    implementComponents(implementations, host);
    implementBlocks(implementations, host);
    implementItems(implementations, host);
    implementDynamicProperties(implementations, host);
    implementScoreboard(implementations, host);
    implementCustom(implementations, host);
    implementStructures(implementations, host);
    implementFeedback(implementations, host);
    implementWorldSettings(implementations, host);
    implementDimension(implementations, host);
    implementTickingAreas(implementations, host);
    implementPrimitiveShapes(implementations, host);
    implementLoot(implementations, host);
    implementClocks(implementations, host);
    implementFog(implementations, host);
    implementVolumes(implementations, host);
    implementPlayerActions(implementations, host, data, signal);
    implementEntityArea(implementations, host);
    implementBlocksAndItems(implementations, host);
    implementWorldEvents(implementations, host, signal);
    implementComponentEvents(implementations, host);
    for (const name of SIGNALS) {
        implementations
            .implement(SERVER, name, 'subscribe', (call) => {
                const callback = callbackOf(call);
                const filter = ENTITY_FILTERED_SIGNALS.has(name)
                    ? entityFilterOf(call, call.args[1])
                    : worldEventFilterOf(call, call.args[1]);
                host.subscribe(name, callback, filter);
                return callback;
            })
            .implement(SERVER, name, 'unsubscribe', (call) => {
                host.unsubscribe(name, callbackOf(call));
                return undefined;
            });
    }
    return implementations;
};

/** Reads the options a subscriber of a world event signal passed, when it passed any. */
const worldEventFilterOf = (call: ScriptCall, options: ScriptValue | undefined): EntityFilter | undefined => {
    const read = worldEventOptionsOf(call, options);
    return read === undefined ? undefined : { options: read };
};

/** Reads the `EntityEventOptions` a subscriber passed: the ids of its entities, and its types as written. */
const entityFilterOf = (call: ScriptCall, options: ScriptValue | undefined): EntityFilter | undefined => {
    if (!(options instanceof ScriptHandle)) return undefined;
    const list = (key: string): ScriptValue[] | undefined => {
        const found = call.engine.get(options, key);
        if (!(found instanceof ScriptHandle)) return undefined;
        try {
            const length = call.engine.get(found, 'length');
            if (typeof length !== 'number') return undefined;
            return Array.from({ length }, (_, index) => call.engine.get(found, String(index)) ?? null);
        } finally {
            call.engine.free(found);
        }
    };
    const entities = list('entities')?.map((each) => {
        const state = call.stateOf(each);
        if (each instanceof ScriptHandle) call.engine.free(each);
        return state === '' ? '' : entityKeyOf(state).id;
    });
    const entityTypes = list('entityTypes')?.map((each) => String(each));
    return {
        ...(entities === undefined ? {} : { entities }),
        ...(entityTypes === undefined ? {} : { entityTypes })
    };
};

/**
 * Registers `world.beforeEvents` and `world.afterEvents` for a player's item use and block
 * break, whose before-events are guards of the world's actions.
 */
const implementPlayerActions = (
    implementations: ScriptApiImplementations,
    host: PackHost,
    data: <Kind extends EventData['kind']>(call: ScriptCall, kind: Kind) => Extract<EventData, { kind: Kind }>,
    signal: (name: SignalName) => { get: () => ScriptHandle }
): void => {
    const stackObject = (item: ScriptItem | undefined): ScriptHandle | undefined =>
        item === undefined ? undefined : host.engine.release(host.create('ItemStack', TAG.itemStack, itemState(item)));
    const player = (id: string): ScriptHandle => host.entity({ id, typeId: PLAYER });
    implementations
        .implement(SERVER, 'WorldBeforeEvents', 'itemUse', signal('ItemUseBeforeEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'itemUse', signal('ItemUseAfterEventSignal'))
        .implement(SERVER, 'ItemUseAfterEvent', 'source', { get: (call) => player(data(call, 'itemUse').player) })
        .implement(SERVER, 'ItemUseAfterEvent', 'itemStack', {
            get: (call) => stackObject(data(call, 'itemUse').item),
            set: (call) => {
                const [stack] = call.args;
                if (stack instanceof ScriptHandle) data(call, 'itemUse').item = itemOf(call.stateOf(stack));
            }
        })
        .implement(SERVER, 'ItemUseBeforeEvent', 'cancel', {
            get: (call) => data(call, 'itemUse').cancel,
            set: (call) => {
                data(call, 'itemUse').cancel = call.args[0] === true;
            }
        })
        .implement(SERVER, 'WorldBeforeEvents', 'playerBreakBlock', signal('PlayerBreakBlockBeforeEventSignal'))
        .implement(SERVER, 'WorldAfterEvents', 'playerBreakBlock', signal('PlayerBreakBlockAfterEventSignal'))
        .implement(SERVER, 'PlayerBreakBlockBeforeEvent', 'player', {
            get: (call) => player(data(call, 'blockBreakBefore').player)
        })
        .implement(SERVER, 'PlayerBreakBlockBeforeEvent', 'cancel', {
            get: (call) => data(call, 'blockBreakBefore').cancel,
            set: (call) => {
                data(call, 'blockBreakBefore').cancel = call.args[0] === true;
            }
        })
        .implement(SERVER, 'PlayerBreakBlockBeforeEvent', 'itemStack', {
            get: (call) => stackObject(data(call, 'blockBreakBefore').item),
            set: (call) => {
                const [stack] = call.args;
                data(call, 'blockBreakBefore').item =
                    stack instanceof ScriptHandle ? itemOf(call.stateOf(stack)) : undefined;
            }
        })
        .implement(SERVER, 'PlayerBreakBlockAfterEvent', 'player', {
            get: (call) => player(data(call, 'blockBreakAfter').player)
        })
        .implement(SERVER, 'PlayerBreakBlockAfterEvent', 'brokenBlockPermutation', {
            get: (call) =>
                host.engine.release(
                    host.create(
                        'BlockPermutation',
                        TAG.permutation,
                        JSON.stringify(data(call, 'blockBreakAfter').broken)
                    )
                )
        })
        .implement(SERVER, 'PlayerBreakBlockAfterEvent', 'itemStackBeforeBreak', {
            get: (call) => stackObject(data(call, 'blockBreakAfter').itemBefore)
        })
        .implement(SERVER, 'PlayerBreakBlockAfterEvent', 'itemStackAfterBreak', {
            get: (call) => stackObject(data(call, 'blockBreakAfter').itemAfter)
        });

    const block = (key: BlockKey): ScriptHandle =>
        host.engine.release(host.create('Block', TAG.block, JSON.stringify(key)));
    implementations
        .implement(
            SERVER,
            'WorldBeforeEvents',
            'playerInteractWithBlock',
            signal('PlayerInteractWithBlockBeforeEventSignal')
        )
        .implement(
            SERVER,
            'WorldAfterEvents',
            'playerInteractWithBlock',
            signal('PlayerInteractWithBlockAfterEventSignal')
        )
        .implement(
            SERVER,
            'WorldBeforeEvents',
            'playerInteractWithEntity',
            signal('PlayerInteractWithEntityBeforeEventSignal')
        )
        .implement(
            SERVER,
            'WorldAfterEvents',
            'playerInteractWithEntity',
            signal('PlayerInteractWithEntityAfterEventSignal')
        );
    for (const className of ['PlayerInteractWithBlockBeforeEvent', 'PlayerInteractWithBlockAfterEvent'] as const) {
        implementations
            .implement(SERVER, className, 'player', { get: (call) => player(data(call, 'blockInteract').player) })
            .implement(SERVER, className, 'block', { get: (call) => block(data(call, 'blockInteract').block) })
            .implement(SERVER, className, 'blockFace', { get: (call) => data(call, 'blockInteract').face })
            .implement(SERVER, className, 'faceLocation', {
                get: (call) => JSON.stringify(data(call, 'blockInteract').faceLocation)
            })
            // A click raises one event; holding the button does not raise more on JSPrismarine.
            .implement(SERVER, className, 'isFirstEvent', {
                get: (call) => {
                    data(call, 'blockInteract');
                    return true;
                }
            });
    }
    implementations
        .implement(SERVER, 'PlayerInteractWithBlockBeforeEvent', 'itemStack', {
            get: (call) => stackObject(data(call, 'blockInteract').item)
        })
        .implement(SERVER, 'PlayerInteractWithBlockBeforeEvent', 'cancel', {
            get: (call) => data(call, 'blockInteract').cancel,
            set: (call) => {
                data(call, 'blockInteract').cancel = call.args[0] === true;
            }
        })
        .implement(SERVER, 'PlayerInteractWithBlockAfterEvent', 'beforeItemStack', {
            get: (call) => stackObject(data(call, 'blockInteract').item)
        })
        .implement(SERVER, 'PlayerInteractWithBlockAfterEvent', 'itemStack', {
            get: (call) => stackObject(data(call, 'blockInteract').itemAfter)
        });
    for (const className of ['PlayerInteractWithEntityBeforeEvent', 'PlayerInteractWithEntityAfterEvent'] as const) {
        implementations
            .implement(SERVER, className, 'player', { get: (call) => player(data(call, 'entityInteract').player) })
            .implement(SERVER, className, 'target', {
                get: (call) => host.entity(data(call, 'entityInteract').target)
            });
    }
    implementations
        .implement(SERVER, 'PlayerInteractWithEntityBeforeEvent', 'itemStack', {
            get: (call) => stackObject(data(call, 'entityInteract').item)
        })
        .implement(SERVER, 'PlayerInteractWithEntityBeforeEvent', 'cancel', {
            get: (call) => data(call, 'entityInteract').cancel,
            set: (call) => {
                data(call, 'entityInteract').cancel = call.args[0] === true;
            }
        })
        .implement(SERVER, 'PlayerInteractWithEntityAfterEvent', 'beforeItemStack', {
            get: (call) => stackObject(data(call, 'entityInteract').item)
        })
        .implement(SERVER, 'PlayerInteractWithEntityAfterEvent', 'itemStack', {
            get: (call) => stackObject(data(call, 'entityInteract').itemAfter)
        });
};
