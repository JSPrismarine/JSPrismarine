/**
 * The behavior of `@minecraft/debug-utilities` for one pack: the debug shape classes, which keep
 * what a script sets on them, and `debugDrawer`, which draws them through the world's
 * {@link ScriptWorld.drawDebugShapes}, and `disableWatchdogTimingWarnings`, which has nothing to turn
 * off. `collectRuntimeStats`, `collectPluginStats` and the diagnostics classes are present and throw
 * `NotImplementedError` ([ADR 0022](../../../../docs/adr/0022-the-script-api-surface-is-generated.md)).
 *
 * The `debug-shapes` scenario of the parity suite's `scripting.debug` family recorded what the
 * pinned Bedrock Dedicated Server does: each class's defaults, a float property that keeps what a
 * 32-bit float keeps, an integer one that drops the fraction, a `RawMessage` text read back inside
 * `rawtext`, and an `addShape` dimension that draws the shape there without becoming its
 * `dimension`.
 *
 * A drawn shape's `timeLeft` counts down in the drawer's step at the end of each script flush. BDS
 * takes the frame's elapsed time off it, so its counts drift with the host's load; this takes off
 * one tick's 0.05 seconds, so a replay counts the same
 * ([ADR 0006](../../../../docs/adr/0006-replay-determinism-contract.md),
 * [ADR 0021](../../../../docs/adr/0021-the-script-watchdog-counts-steps.md)). Nothing here reads a
 * clock, and a shape's id comes from the world's count, not from the shape's memory.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { isRecord } from '../isRecord';
import type { ScriptApiContext } from '../shape/binding';
import type { ScriptApiImplementations, ScriptCall } from '../shape/implementations';
import type { ScriptEngine } from '../ScriptEngine';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import type { EntityKey } from './serverObjects';
import { entityKeyOf, readMessage } from './serverObjects';
import type {
    ScriptDebugShape,
    ScriptDebugShapeChange,
    ScriptDebugShapeKind,
    ScriptRgba,
    ScriptVector2,
    ScriptVector3
} from './world';

/** The module the implementations here belong to. */
export const DEBUG_UTILITIES = '@minecraft/debug-utilities';

/** The seconds one tick takes off a drawn shape's `timeLeft`: a twentieth of a second. */
export const TICK_SECONDS = 0.05;

/**
 * A shape's state: what the world draws, its id, and a text shape's text as the script gave it.
 * A shape is made by its class's constructor, so the object carries no tag of its own.
 */
interface ShapeState extends ScriptDebugShape {
    readonly id: number;
    /** A text shape's `text`: a string, or a `RawMessage` inside `rawtext`. */
    readonly message?: unknown;
    /** The seconds `timeLeft` was last set to, which `totalTimeLeft` reads. */
    readonly totalTimeLeft?: number;
    /** The type of the entity `attachedTo` names, which its object carries. */
    readonly attachedType?: string;
}

/** What one pack's `@minecraft/debug-utilities` reaches of the runtime and the world. */
export interface DebugPackHost {
    readonly drawer: PackDebugDrawer;
    /** A new shape id, unique in the world. */
    nextId(): number;
    /** The dimension a `Dimension` object stands for, or undefined for any other value. */
    dimensionOf(value: ScriptValue): string | undefined;
    /** The pack's `Dimension` object for a dimension id. */
    dimension(id: string): ScriptHandle;
    /** The pack's object for an entity. */
    entity(key: EntityKey): ScriptHandle;
    /**
     * Makes a value in the pack's realm from JSON text, with the realm's own `JSON.parse` as it
     * was before any of the pack's code ran. A handle it returns belongs to the caller.
     */
    parse(json: string): ScriptValue;
}

const f32 = Math.fround;

/**
 * What a tick leaves of a `timeLeft`: a float less 0.05 seconds, and 0 once that is gone. A float
 * holds neither 0.05 nor most of its multiples, so a count from 0.2 ends 8e-9 short of 0, which a
 * millionth of a second rounds away.
 */
export const countDown = (timeLeft: number): number => {
    const left = f32(timeLeft - TICK_SECONDS);
    return left < 1e-6 ? 0 : left;
};

/** Reads a shape's state. The host wrote every state with JSON.stringify. */
const shapeOf = (state: string): ShapeState => {
    const parsed: unknown = state === '' ? undefined : JSON.parse(state);
    if (!isRecord(parsed) || typeof parsed.id !== 'number')
        throw new ScriptHostErrors.ObjectCarriesNoState({ what: 'debug shape' });
    // The host wrote the state from a ShapeState.
    return parsed as unknown as ShapeState;
};

/** What a script's value parses to as JSON, or undefined for a value with none. */
const jsonOf = (call: ScriptCall, value: ScriptValue): unknown => {
    const json = call.stringify(value);
    // The engine wrote the string with JSON.stringify.
    return json === undefined ? undefined : JSON.parse(json);
};

/**
 * Reads an interface whose properties are all numbers, such as an `RGBA` or a `Vector3`, in BDS's
 * order, which is alphabetical, keeping what a 32-bit float keeps of each.
 * @param target - What BDS's error names: `Function argument [n]`, or `Function return value` for a setter.
 */
const numbers = <Key extends string>(parsed: unknown, keys: readonly Key[], target: string): Record<Key, number> => {
    const read: Partial<Record<Key, number>> = {};
    for (const key of [...keys].sort()) {
        const value = isRecord(parsed) ? parsed[key] : undefined;
        if (typeof value !== 'number') {
            throw new ScriptHostErrors.InterfacePropertyMissing({ property: key, expected: 'number', target });
        }
        // JSON.stringify writes NaN and the infinities as null, so a value here is finite.
        read[key] = f32(value);
    }
    // Every key was read above.
    return read as Record<Key, number>;
};

/**
 * Reads an interface value a setter was given. The engine's JSON drops NaN and the infinities to
 * null, so they are looked for on the object itself first.
 */
const setterNumbers = <Key extends string>(call: ScriptCall, keys: readonly Key[]): Record<Key, number> => {
    const [value] = call.args;
    if (value instanceof ScriptHandle) {
        for (const key of [...keys].sort()) {
            const part = call.engine.get(value, key);
            if (part instanceof ScriptHandle) call.engine.free(part);
            if (typeof part === 'number' && !Number.isFinite(part)) {
                throw new ScriptHostErrors.InterfacePropertyNotFinite({
                    value: String(part),
                    property: key,
                    expected: 'number',
                    target: 'Function return value'
                });
            }
        }
    }
    return numbers(jsonOf(call, value), keys, 'Function return value');
};

const VECTOR3 = ['x', 'y', 'z'] as const;
const VECTOR2 = ['x', 'y'] as const;
const RGBA = ['alpha', 'blue', 'green', 'red'] as const;

/** The type BDS names a shape's location by in its conversion error. */
const LOCATION_TYPE = 'DimensionLocation | Vector3';

/**
 * Reads a `DimensionLocation | Vector3` argument: the point, and the dimension a
 * `DimensionLocation` names.
 * @throws {TypeError} BDS's conversion error for anything else.
 */
const locationArgument = (
    call: ScriptCall,
    host: DebugPackHost,
    index: number
): { location: ScriptVector3; dimension?: string } => {
    const value = call.args[index];
    const parsed = jsonOf(call, value);
    const finite = (key: string): boolean =>
        isRecord(parsed) && typeof parsed[key] === 'number' && Number.isFinite(parsed[key]);
    if (!VECTOR3.every(finite) || !(value instanceof ScriptHandle)) {
        throw new ScriptHostErrors.ArgumentVariantConversionFailed({ argument: index, type: LOCATION_TYPE });
    }
    const location = numbers(parsed, VECTOR3, `Function argument [${index}]`);
    const held = call.engine.get(value, 'dimension');
    if (held === undefined) return { location };
    const dimension = host.dimensionOf(held);
    if (held instanceof ScriptHandle) call.engine.free(held);
    if (dimension === undefined) {
        throw new ScriptHostErrors.ArgumentVariantConversionFailed({ argument: index, type: LOCATION_TYPE });
    }
    return { location, dimension };
};

const WHITE: ScriptRgba = { red: 1, green: 1, blue: 1, alpha: 1 };
const ORIGIN: ScriptVector3 = { x: 0, y: 0, z: 0 };
const UNIT: ScriptVector3 = { x: 1, y: 1, z: 1 };

/** Each class's own properties as a new shape has them, as the `debug-shapes` scenario recorded. */
const DEFAULTS: Readonly<Record<ScriptDebugShapeKind, Partial<ScriptDebugShape>>> = {
    DebugArrow: { headLength: 1, headRadius: 0.5, headSegments: 4 },
    DebugBox: { bound: UNIT },
    DebugCircle: {},
    DebugCone: { height: 1, numSegments: 20, radii: { x: 1, y: 1 } },
    DebugCylinder: { height: 1, numSegments: 20, radii: { x: 1, y: 1 } },
    DebugEllipsoid: { radii: UNIT, segmentsPerAxis: 20 },
    DebugLine: {},
    DebugPyramid: { height: 1, width: 1 },
    DebugSphere: {},
    DebugText: {
        backfaceVisible: true,
        depthTest: false,
        lineGapHeight: 0,
        textBackfaceVisible: false,
        useRotation: false
    }
};

/** A text as a `DebugText` keeps it: a string, or a `RawMessage` inside `rawtext`. */
const messageOf = (parsed: unknown): unknown =>
    typeof parsed === 'string' || (isRecord(parsed) && 'rawtext' in parsed) ? parsed : { rawtext: [parsed] };

/** The text a `DebugText` draws: the string, or the `RawMessage` read as chat reads one. */
const textOf = (call: ScriptCall, value: ScriptValue): string =>
    typeof value === 'string' ? value : readMessage(call.engine, value);

/** The type BDS names a text by in its conversion error. */
const TEXT_TYPE = 'string | RawMessage';

/** Reads a `string | RawMessage` argument, as a `DebugText` keeps it and as it draws it. */
const textArgument = (call: ScriptCall, index: number): Pick<ShapeState, 'message' | 'text'> => {
    const value = call.args[index];
    const parsed = jsonOf(call, value);
    if (typeof value !== 'string' && !(value instanceof ScriptHandle && isRecord(parsed))) {
        throw new ScriptHostErrors.ArgumentVariantConversionFailed({ argument: index, type: TEXT_TYPE });
    }
    return { message: messageOf(parsed), text: textOf(call, value) };
};

/**
 * One pack's drawn shapes. It holds a handle of each, so a shape the script changes after
 * `addShape` is drawn as it now is, and frees it once the shape is no longer drawn.
 */
export class PackDebugDrawer {
    private readonly drawn = new Map<
        number,
        {
            readonly handle: ScriptHandle;
            /** The dimension `addShape` named, which the shape is drawn in. */
            dimension?: string;
            /** Whether `removeShape` took it out this tick; it goes in the drawer's step. */
            removing: boolean;
            /** What the world was last told, without `timeLeft`, which the world counts itself. */
            sent?: string;
        }
    >();

    public constructor(
        private readonly engine: ScriptEngine,
        private readonly api: ScriptApiContext
    ) {}

    /** Draws a shape, or keeps drawing it. A shape the drawer already holds stays as it is. */
    public add(shape: ScriptValue, dimension: string | undefined): void {
        if (!(shape instanceof ScriptHandle)) return;
        const id = this.idOf(shape);
        if (id === undefined) return;
        const known = this.drawn.get(id);
        if (known !== undefined) {
            known.removing = false;
            return;
        }
        this.drawn.set(id, {
            handle: this.engine.duplicate(shape),
            removing: false,
            ...(dimension === undefined ? {} : { dimension })
        });
    }

    /** Takes a shape out. It still loses this tick's time, as BDS's does, and goes in the step. */
    public remove(shape: ScriptValue): void {
        const id = this.idOf(shape);
        const known = id === undefined ? undefined : this.drawn.get(id);
        if (known !== undefined) known.removing = true;
    }

    /** The shapes being drawn, in the order they were added, as handles the drawer keeps. */
    public shapes(): ScriptHandle[] {
        return [...this.drawn.values()].filter((entry) => !entry.removing).map((entry) => entry.handle);
    }

    /** Takes every shape out, as {@link PackDebugDrawer.remove} does one. */
    public removeAll(): void {
        for (const entry of this.drawn.values()) entry.removing = true;
    }

    /**
     * The drawer's step, at the end of a script flush: takes a tick off each drawn shape's
     * `timeLeft`, drops the shapes taken out or out of time, and returns what the world must draw
     * differently.
     */
    public step(): ScriptDebugShapeChange[] {
        const changes: ScriptDebugShapeChange[] = [];
        for (const [id, entry] of this.drawn) {
            let state = shapeOf(this.api.identify(entry.handle)?.state ?? '');
            if (state.timeLeft !== undefined) {
                state = { ...state, timeLeft: countDown(state.timeLeft) };
                this.api.setState(entry.handle, JSON.stringify(state));
            }
            if (entry.removing || (state.timeLeft !== undefined && state.timeLeft <= 0)) {
                if (entry.sent !== undefined) changes.push({ id });
                this.engine.free(entry.handle);
                this.drawn.delete(id);
                continue;
            }
            const { id: _id, message: _message, totalTimeLeft: _total, attachedType: _type, ...shape } = state;
            const drawn: ScriptDebugShape =
                entry.dimension === undefined || shape.dimension !== undefined
                    ? shape
                    : { ...shape, dimension: entry.dimension };
            const { timeLeft: _left, ...compared } = drawn;
            const sent = JSON.stringify({ ...compared, total: state.totalTimeLeft });
            if (sent === entry.sent) continue;
            entry.sent = sent;
            changes.push({ id, shape: drawn });
        }
        return changes;
    }

    /** Frees every handle, and returns the removal of each shape the world was told of. */
    public clear(): ScriptDebugShapeChange[] {
        const changes: ScriptDebugShapeChange[] = [];
        for (const [id, entry] of this.drawn) {
            if (entry.sent !== undefined) changes.push({ id });
            this.engine.free(entry.handle);
        }
        this.drawn.clear();
        return changes;
    }

    /** The id of a shape a constructor of this module made, which its state carries. */
    private idOf(shape: ScriptValue): number | undefined {
        const state = this.api.identify(shape)?.state ?? '';
        if (!state.startsWith('{')) return undefined;
        // The host wrote every state with JSON.stringify.
        const parsed: unknown = JSON.parse(state);
        return isRecord(parsed) && typeof parsed.id === 'number' && typeof parsed.kind === 'string'
            ? parsed.id
            : undefined;
    }
}

/**
 * The readers and writers of a shape's state, which every shape class's members are made from.
 * @param host - What the pack's shapes reach.
 */
export const shapeHelpers = (host: DebugPackHost) => {
    /** Makes a shape's state from its constructor's location argument. */
    const made = (call: ScriptCall, kind: ScriptDebugShapeKind, own: Partial<ScriptDebugShape> = {}): string => {
        const { location, dimension } = locationArgument(call, host, 0);
        const state: ShapeState = {
            id: host.nextId(),
            kind,
            location,
            ...(dimension === undefined ? {} : { dimension }),
            color: WHITE,
            scale: 1,
            rotation: ORIGIN,
            ...DEFAULTS[kind],
            ...own
        };
        return JSON.stringify(state);
    };
    /** Writes one change to a shape's state. */
    const write = (call: ScriptCall, change: Partial<ShapeState>): void => {
        call.setState(JSON.stringify({ ...shapeOf(call.state), ...change }));
    };
    /** Removes one key from a shape's state, for an optional property set to undefined. */
    const drop = (call: ScriptCall, ...keys: ReadonlyArray<keyof ShapeState>): void => {
        const state: Record<string, unknown> = { ...shapeOf(call.state) };
        for (const key of keys) delete state[key];
        call.setState(JSON.stringify(state));
    };
    const read = (call: ScriptCall): ShapeState => shapeOf(call.state);

    /** A float property that may be left unset. */
    const optionalFloat = (key: 'maximumRenderDistance' | 'depth') => ({
        get: (call: ScriptCall) => read(call)[key],
        set: (call: ScriptCall) => {
            const [value] = call.args;
            if (typeof value === 'number') write(call, { [key]: f32(value) });
            else drop(call, key);
        }
    });
    const float = (key: 'scale' | 'headLength' | 'headRadius' | 'height' | 'width' | 'lineGapHeight') => ({
        get: (call: ScriptCall) => read(call)[key] ?? 0,
        set: (call: ScriptCall) => write(call, { [key]: f32(Number(call.args[0])) })
    });
    const integer = (key: 'headSegments' | 'numSegments' | 'segmentsPerAxis') => ({
        get: (call: ScriptCall) => read(call)[key] ?? 0,
        set: (call: ScriptCall) => write(call, { [key]: Math.trunc(Number(call.args[0])) })
    });
    const flag = (key: 'backfaceVisible' | 'depthTest' | 'textBackfaceVisible' | 'useRotation') => ({
        get: (call: ScriptCall) => read(call)[key] === true,
        set: (call: ScriptCall) => write(call, { [key]: call.args[0] === true })
    });
    const vector3 = (key: 'bound' | 'endLocation' | 'rotation' | 'radii') => ({
        get: (call: ScriptCall) => JSON.stringify(read(call)[key] ?? ORIGIN),
        set: (call: ScriptCall) => write(call, { [key]: setterNumbers(call, VECTOR3) })
    });
    const vector2 = {
        get: (call: ScriptCall) => JSON.stringify(read(call).radii ?? { x: 0, y: 0 }),
        set: (call: ScriptCall) => write(call, { radii: setterNumbers(call, VECTOR2) satisfies ScriptVector2 })
    };
    /** A line's or an arrow's constructor: a location and the other end. */
    const lineMade = (kind: 'DebugArrow' | 'DebugLine') => (call: ScriptCall) =>
        made(call, kind, { endLocation: numbers(jsonOf(call, call.args[1]), VECTOR3, 'Function argument [1]') });

    /** A text's constructor: a location and the text. */
    const textMade = (call: ScriptCall) => made(call, 'DebugText', textArgument(call, 1));
    return { made, write, drop, read, optionalFloat, float, integer, flag, vector3, vector2, lineMade, textMade };
};

/**
 * The members a drawn shape shares between `@minecraft/debug-utilities`' `DebugShape` and
 * `DebugText` and `@minecraft/server`'s `PrimitiveShape` and `TextPrimitive`, which keep the
 * same state and draw through the same drawer.
 * @param host - What the pack's shapes reach.
 */
export const sharedShapeMembers = (host: DebugPackHost) => {
    const { write, drop, read, optionalFloat, float, flag, vector3 } = shapeHelpers(host);
    return {
        text: {
            get: (call: ScriptCall) => {
                const { message } = read(call);
                if (typeof message === 'string') return message;
                const parsed = host.parse(JSON.stringify(message ?? ''));
                return parsed instanceof ScriptHandle ? call.engine.release(parsed) : parsed;
            }
        },
        setText: (call: ScriptCall) => {
            write(call, textArgument(call, 0));
            return undefined;
        },
        backfaceVisible: flag('backfaceVisible'),
        depthTest: flag('depthTest'),
        textBackfaceVisible: flag('textBackfaceVisible'),
        useRotation: flag('useRotation'),
        lineGapHeight: float('lineGapHeight'),
        backgroundColorOverride: {
            get: (call: ScriptCall) => {
                const color = read(call).backgroundColorOverride;
                return color === undefined ? undefined : JSON.stringify(color);
            },
            set: (call: ScriptCall) => {
                if (call.args[0] === undefined) drop(call, 'backgroundColorOverride');
                else write(call, { backgroundColorOverride: setterNumbers(call, RGBA) });
            }
        },
        location: {
            get: (call: ScriptCall) => JSON.stringify(read(call).location)
        },
        setLocation: (call: ScriptCall) => {
            const { location, dimension } = locationArgument(call, host, 0);
            if (dimension === undefined) write(call, { location });
            else write(call, { location, dimension });
            return undefined;
        },
        dimension: {
            get: (call: ScriptCall) => {
                const { dimension } = read(call);
                return dimension === undefined ? undefined : host.dimension(dimension);
            }
        },
        color: {
            get: (call: ScriptCall) => JSON.stringify(read(call).color),
            set: (call: ScriptCall) => write(call, { color: setterNumbers(call, RGBA) })
        },
        scale: float('scale'),
        rotation: vector3('rotation'),
        maximumRenderDistance: optionalFloat('maximumRenderDistance'),
        timeLeft: {
            get: (call: ScriptCall) => read(call).timeLeft,
            set: (call: ScriptCall) => {
                const [value] = call.args;
                if (typeof value !== 'number') drop(call, 'timeLeft', 'totalTimeLeft');
                else write(call, { timeLeft: f32(value), totalTimeLeft: f32(value) });
            }
        },
        totalTimeLeft: { get: (call: ScriptCall) => read(call).totalTimeLeft },
        hasDuration: {
            get: (call: ScriptCall) => read(call).timeLeft !== undefined
        },
        attachedTo: {
            get: (call: ScriptCall) => {
                const { attachedTo, attachedType } = read(call);
                return attachedTo === undefined || attachedType === undefined
                    ? undefined
                    : host.entity({ id: attachedTo, typeId: attachedType });
            },
            set: (call: ScriptCall) => {
                const [value] = call.args;
                if (value === undefined) {
                    drop(call, 'attachedTo', 'attachedType');
                    return;
                }
                const { id, typeId } = entityKeyOf(call.stateOf(value));
                write(call, { attachedTo: id, attachedType: typeId });
            }
        },
        remove: (call: ScriptCall) => {
            host.drawer.remove(call.self);
            return undefined;
        }
    };
};

/**
 * Registers the behavior of one pack's `@minecraft/debug-utilities` on its implementations.
 * @param implementations - The pack's implementations, which `@minecraft/server`'s are on too.
 */
export const debugUtilitiesImplementations = (
    implementations: ScriptApiImplementations,
    host: DebugPackHost
): ScriptApiImplementations => {
    const { made, optionalFloat, float, integer, vector3, vector2, lineMade } = shapeHelpers(host);
    const shared = sharedShapeMembers(host);

    return (
        implementations
            .implement(DEBUG_UTILITIES, 'DebugArrow', 'constructor', lineMade('DebugArrow'))
            .implement(DEBUG_UTILITIES, 'DebugArrow', 'headLength', float('headLength'))
            .implement(DEBUG_UTILITIES, 'DebugArrow', 'headRadius', float('headRadius'))
            .implement(DEBUG_UTILITIES, 'DebugArrow', 'headSegments', integer('headSegments'))
            .implement(DEBUG_UTILITIES, 'DebugBox', 'constructor', (call) => made(call, 'DebugBox'))
            .implement(DEBUG_UTILITIES, 'DebugBox', 'bound', vector3('bound'))
            .implement(DEBUG_UTILITIES, 'DebugCircle', 'constructor', (call) => made(call, 'DebugCircle'))
            .implement(DEBUG_UTILITIES, 'DebugCone', 'constructor', (call) => made(call, 'DebugCone'))
            .implement(DEBUG_UTILITIES, 'DebugCone', 'height', float('height'))
            .implement(DEBUG_UTILITIES, 'DebugCone', 'numSegments', integer('numSegments'))
            .implement(DEBUG_UTILITIES, 'DebugCone', 'radii', vector2)
            .implement(DEBUG_UTILITIES, 'DebugCylinder', 'constructor', (call) => made(call, 'DebugCylinder'))
            .implement(DEBUG_UTILITIES, 'DebugCylinder', 'height', float('height'))
            .implement(DEBUG_UTILITIES, 'DebugCylinder', 'numSegments', integer('numSegments'))
            .implement(DEBUG_UTILITIES, 'DebugCylinder', 'radii', vector2)
            .implement(DEBUG_UTILITIES, 'DebugEllipsoid', 'constructor', (call) => made(call, 'DebugEllipsoid'))
            .implement(DEBUG_UTILITIES, 'DebugEllipsoid', 'radii', vector3('radii'))
            .implement(DEBUG_UTILITIES, 'DebugEllipsoid', 'segmentsPerAxis', integer('segmentsPerAxis'))
            .implement(DEBUG_UTILITIES, 'DebugLine', 'constructor', lineMade('DebugLine'))
            .implement(DEBUG_UTILITIES, 'DebugLine', 'endLocation', vector3('endLocation'))
            .implement(DEBUG_UTILITIES, 'DebugPyramid', 'constructor', (call) => made(call, 'DebugPyramid'))
            .implement(DEBUG_UTILITIES, 'DebugPyramid', 'depth', optionalFloat('depth'))
            .implement(DEBUG_UTILITIES, 'DebugPyramid', 'height', float('height'))
            .implement(DEBUG_UTILITIES, 'DebugPyramid', 'width', float('width'))
            .implement(DEBUG_UTILITIES, 'DebugSphere', 'constructor', (call) => made(call, 'DebugSphere'))
            .implement(DEBUG_UTILITIES, 'DebugText', 'constructor', (call) =>
                made(call, 'DebugText', textArgument(call, 1))
            )
            .implement(DEBUG_UTILITIES, 'DebugText', 'text', shared.text)
            .implement(DEBUG_UTILITIES, 'DebugText', 'setText', shared.setText)
            .implement(DEBUG_UTILITIES, 'DebugText', 'backfaceVisible', shared.backfaceVisible)
            .implement(DEBUG_UTILITIES, 'DebugText', 'depthTest', shared.depthTest)
            .implement(DEBUG_UTILITIES, 'DebugText', 'textBackfaceVisible', shared.textBackfaceVisible)
            .implement(DEBUG_UTILITIES, 'DebugText', 'useRotation', shared.useRotation)
            .implement(DEBUG_UTILITIES, 'DebugText', 'lineGapHeight', shared.lineGapHeight)
            .implement(DEBUG_UTILITIES, 'DebugText', 'backgroundColorOverride', shared.backgroundColorOverride)
            .implement(DEBUG_UTILITIES, 'DebugShape', 'location', shared.location)
            .implement(DEBUG_UTILITIES, 'DebugShape', 'setLocation', shared.setLocation)
            .implement(DEBUG_UTILITIES, 'DebugShape', 'dimension', shared.dimension)
            .implement(DEBUG_UTILITIES, 'DebugShape', 'color', shared.color)
            .implement(DEBUG_UTILITIES, 'DebugShape', 'scale', shared.scale)
            .implement(DEBUG_UTILITIES, 'DebugShape', 'rotation', shared.rotation)
            .implement(DEBUG_UTILITIES, 'DebugShape', 'maximumRenderDistance', shared.maximumRenderDistance)
            .implement(DEBUG_UTILITIES, 'DebugShape', 'timeLeft', shared.timeLeft)
            .implement(DEBUG_UTILITIES, 'DebugShape', 'totalTimeLeft', shared.totalTimeLeft)
            .implement(DEBUG_UTILITIES, 'DebugShape', 'hasDuration', shared.hasDuration)
            .implement(DEBUG_UTILITIES, 'DebugShape', 'attachedTo', shared.attachedTo)
            .implement(DEBUG_UTILITIES, 'DebugShape', 'remove', shared.remove)
            .implement(DEBUG_UTILITIES, 'DebugDrawer', 'addShape', (call) => {
                const [shape, dimension] = call.args;
                host.drawer.add(shape, dimension === undefined ? undefined : host.dimensionOf(dimension));
                return undefined;
            })
            .implement(DEBUG_UTILITIES, 'DebugDrawer', 'removeShape', (call) => {
                host.drawer.remove(call.args[0]);
                return undefined;
            })
            .implement(DEBUG_UTILITIES, 'DebugDrawer', 'removeAll', () => {
                host.drawer.removeAll();
                return undefined;
            })
            // BDS warns when a script runs slow by the clock. The host never reads one: its watchdog
            // counts steps and reports only a hang, which this does not turn off. So there is no
            // timing warning to turn off.
            .implement(DEBUG_UTILITIES, '', 'disableWatchdogTimingWarnings', () => undefined)
    );
};
