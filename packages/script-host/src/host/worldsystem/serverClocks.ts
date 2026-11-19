/**
 * The world's clocks, the camera's spline classes, `Trigger`, and `world.soundDefinitionRegistry`.
 *
 * The `world-clocks` scenario recorded what BDS does. A world has one clock,
 * `minecraft:overworld`, whose time is the world's absolute time, with six built-in time markers
 * that repeat each day and a pause of its own, apart from the daylight cycle rule. `set` moves the
 * clock to a marker's time, `skipTo` forward to the marker's next time and `rewindTo` back to its
 * last. A spline keeps its control points but reads back none, and a server has no resource pack
 * whose sound definitions the registry could list.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { ScriptApiError } from '../../errors';
import { isRecord } from '../../isRecord';
import type { ScriptApiImplementations, ScriptCall } from '../../shape/implementations';
import { ScriptHandle } from '../../values';
import type { PackHost } from '../minecraftServer';
import { SERVER } from '../serverObjects';
import type { ScriptTimeMarker } from './seam';
import { DAY_TICKS, worldSystemOf } from './serverWorld';
import { WORLD_TAG } from './tags';

/** The one clock a world has. */
export const OVERWORLD_CLOCK = 'minecraft:overworld';

/** The overworld clock's own markers, which no script can remove, in the order BDS lists them. */
export const BUILT_IN_MARKERS: readonly ScriptTimeMarker[] = [
    { name: 'minecraft:sunrise', time: 23_000, period: DAY_TICKS },
    { name: 'minecraft:night', time: 13_000, period: DAY_TICKS },
    { name: 'minecraft:noon', time: 6_000, period: DAY_TICKS },
    { name: 'minecraft:midnight', time: 18_000, period: DAY_TICKS },
    { name: 'minecraft:day', time: 1_000, period: DAY_TICKS },
    { name: 'minecraft:sunset', time: 12_000, period: DAY_TICKS }
];

const clockError = (errorClass: string, message: string): ScriptApiError =>
    new ScriptApiError(SERVER, errorClass, message);

/** The first of a marker's times after `now`, or its one time for a marker that comes once. */
export const nextMarkerTime = ({ time, period }: ScriptTimeMarker, now: number): number => {
    if (period === undefined || period <= 0 || time > now) return time;
    return time + (Math.floor((now - time) / period) + 1) * period;
};

/** The last of a marker's times at or before `now`, or undefined for a once-only marker still to come. */
export const lastMarkerTime = ({ time, period }: ScriptTimeMarker, now: number): number | undefined => {
    if (time <= now)
        return period === undefined || period <= 0 ? time : time + Math.floor((now - time) / period) * period;
    return undefined;
};

/**
 * Registers the clock, spline, trigger and sound definition members.
 * @param implementations - The pack's implementations, which this adds to.
 * @param host - The pack's view of the runtime and the world.
 */
export const implementClocks = (implementations: ScriptApiImplementations, host: PackHost): void => {
    const system = () => worldSystemOf(host);
    const markers = (): readonly ScriptTimeMarker[] => [...BUILT_IN_MARKERS, ...system().timeMarkers()];
    const clockObject = (name: string): ScriptHandle => host.instance('WorldClock', WORLD_TAG.worldClock, name);
    const markerObject = (name: string): ScriptHandle =>
        host.instance('TimeMarker', WORLD_TAG.timeMarker, JSON.stringify({ clock: OVERWORLD_CLOCK, name }));
    /** The marker a `string | TimeMarker` argument names, or BDS's error for one the clock does not have. */
    const markerOf = (call: ScriptCall): ScriptTimeMarker => {
        const [given] = call.args;
        const name = given instanceof ScriptHandle ? markerName(call.stateOf(given)) : String(given);
        const found = markers().find((marker) => marker.name === name);
        if (found === undefined) {
            throw clockError(
                'WorldClockTimeMarkerNotFoundError',
                `Failed to find time marker '${name}' in world clock '${call.state}'.`
            );
        }
        return found;
    };
    const markerName = (state: string): string => {
        // The host wrote every marker state with JSON.stringify.
        const parsed: unknown = state === '' ? undefined : JSON.parse(state);
        if (!isRecord(parsed) || typeof parsed.name !== 'string') {
            throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'time marker' });
        }
        return parsed.name;
    };
    /** The marker a `TimeMarker` object stands for, or BDS's error once it is removed. */
    const liveMarker = (call: ScriptCall): ScriptTimeMarker => {
        const name = markerName(call.state);
        const found = markers().find((marker) => marker.name === name);
        if (found === undefined) {
            throw clockError('WorldClockInvalidTimeMarkerError', `Time marker '${name}' is no longer valid.`);
        }
        return found;
    };
    /** A field of a definition's or a duration's JSON state. */
    const stateField = (call: ScriptCall, key: string): unknown => {
        // The host wrote the state with JSON.stringify.
        const parsed: unknown = call.state === '' ? undefined : JSON.parse(call.state);
        return isRecord(parsed) ? parsed[key] : undefined;
    };
    const jsonField = (call: ScriptCall, key: string): string | undefined => {
        const value = stateField(call, key);
        return value === undefined ? undefined : JSON.stringify(value);
    };
    const time = () => system().absoluteTime();
    const setTime = (value: number) => system().setAbsoluteTime(value);
    /** A plain array in the pack's realm of handles the host owns. */
    const arrayOf = (values: readonly ScriptHandle[]): ScriptHandle => {
        const array = host.engine.evaluate('[]');
        if (!(array instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
        values.forEach((value, index) => host.engine.set(array, String(index), value));
        return host.engine.release(array);
    };

    implementations
        .implement(SERVER, 'World', 'getClock', (call) => {
            const name = String(call.args[0]);
            if (name !== OVERWORLD_CLOCK) {
                throw clockError('WorldClockNotFoundError', `Failed to find world clock '${name}'.`);
            }
            return clockObject(name);
        })
        .implement(SERVER, 'WorldClock', 'name', { get: (call) => call.state })
        .implement(SERVER, 'WorldClock', 'time', {
            get: () => time(),
            set: (call) => setTime(Math.trunc(Number(call.args[0])))
        })
        .implement(SERVER, 'WorldClock', 'isPaused', {
            get: () => system().clockPaused(),
            set: (call) => system().setClockPaused(call.args[0] === true)
        })
        .implement(SERVER, 'WorldClock', 'timeMarkers', {
            get: () => arrayOf(markers().map((marker) => markerObject(marker.name)))
        })
        .implement(SERVER, 'WorldClock', 'addTimeMarker', (call) => {
            const [options] = call.args;
            const json = call.stringify(options ?? null);
            // The engine wrote the string with JSON.stringify; the binding checked it is a TimeMarkerOptions.
            const parsed: unknown = json === undefined ? undefined : JSON.parse(json);
            if (!isRecord(parsed))
                throw new ScriptHostErrors.ArgumentNotOfType({
                    argument: 'timeMarkerOptions',
                    type: 'TimeMarkerOptions'
                });
            const name = String(parsed.name);
            if (markers().some((marker) => marker.name === name)) {
                throw clockError(
                    'WorldClockAddTimeMarkerError',
                    `Failed to add time marker '${name}' on world clock '${call.state}' Time marker name already exists.`
                );
            }
            system().addTimeMarker({
                name,
                time: Math.trunc(Number(parsed.time)),
                ...(typeof parsed.period === 'number' ? { period: Math.trunc(parsed.period) } : {})
            });
            return undefined;
        })
        .implement(SERVER, 'WorldClock', 'removeTimeMarker', (call) => {
            const marker = markerOf(call);
            if (marker.name.startsWith('minecraft:')) {
                throw clockError(
                    'WorldClockRemoveMinecraftTimeMarkerError',
                    `Failed to remove time marker '${marker.name}' from world clock '${call.state}'. A time marker with the 'minecraft' namespace cannot be removed.`
                );
            }
            system().removeTimeMarker(marker.name);
            return undefined;
        })
        .implement(SERVER, 'WorldClock', 'set', (call) => {
            setTime(markerOf(call).time);
            return undefined;
        })
        .implement(SERVER, 'WorldClock', 'skipTo', (call) => {
            setTime(nextMarkerTime(markerOf(call), time()));
            return undefined;
        })
        .implement(SERVER, 'WorldClock', 'rewindTo', (call) => {
            const marker = markerOf(call);
            const last = lastMarkerTime(marker, time());
            if (last === undefined) {
                throw clockError(
                    'WorldClockRewindError',
                    `Failed to rewind world clock '${call.state}' to time marker '${marker.name}'.`
                );
            }
            setTime(last);
            return undefined;
        })
        .implement(SERVER, 'TimeMarker', 'name', { get: (call) => markerName(call.state) })
        .implement(SERVER, 'TimeMarker', 'time', { get: (call) => liveMarker(call).time })
        .implement(SERVER, 'TimeMarker', 'period', { get: (call) => liveMarker(call).period })
        // A spline keeps the points a camera animation reads, though BDS reads back none.
        .implement(SERVER, 'LinearSpline', 'constructor', () => '[]')
        .implement(SERVER, 'LinearSpline', 'controlPoints', {
            get: () => '[]',
            set: (call) => call.setState(call.stringify(call.args[0] ?? null) ?? '[]')
        })
        .implement(SERVER, 'CatmullRomSpline', 'constructor', () => '[]')
        .implement(SERVER, 'CatmullRomSpline', 'controlPoints', {
            get: () => '[]',
            set: (call) => call.setState(call.stringify(call.args[0] ?? null) ?? '[]')
        })
        .implement(SERVER, 'Trigger', 'constructor', (call) => String(call.args[0]))
        .implement(SERVER, 'Trigger', 'eventName', {
            get: (call) => call.state,
            set: (call) => call.setState(String(call.args[0]))
        })
        .implement(SERVER, 'World', 'soundDefinitionRegistry', {
            get: () => host.instance('SoundDefinitionRegistry', WORLD_TAG.soundDefinitionRegistry)
        })
        // Sound definitions live in a resource pack, which a server, like BDS, does not load.
        .implement(SERVER, 'SoundDefinitionRegistry', 'getDefinitions', () => arrayOf([]))
        .implement(SERVER, 'SoundInstance', 'durationInfo', { get: () => undefined })
        // A definition or a duration carries what it reports as JSON, for a world that has some.
        .implement(SERVER, 'SoundDefinition', 'soundEventId', {
            get: (call) => String(stateField(call, 'soundEventId') ?? '')
        })
        .implement(SERVER, 'SoundDefinition', 'durationInfo', { get: (call) => jsonField(call, 'durationInfo') })
        .implement(SERVER, 'SoundDefinition', 'musicInfo', { get: (call) => jsonField(call, 'musicInfo') })
        .implement(SERVER, 'SoundDefinition', 'tags', { get: (call) => jsonField(call, 'tags') })
        .implement(SERVER, 'SoundDurationInfo', 'duration', {
            get: (call) => Number(stateField(call, 'duration') ?? 0)
        })
        .implement(SERVER, 'SoundDurationInfo', 'isActive', { get: (call) => stateField(call, 'active') === true })
        .implement(SERVER, 'SoundDurationInfo', 'getPlaybackPosition', (call) =>
            Number(stateField(call, 'position') ?? 0)
        );
};
