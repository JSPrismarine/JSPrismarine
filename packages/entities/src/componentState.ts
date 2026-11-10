/**
 * The one home of the per-entity state a component keeps between ticks.
 *
 * A component's timers, cooldowns and counters decide what the entity does next, so they are
 * authoritative state like an attribute or a property. They live on the {@link EntityInstance} in
 * a {@link ComponentStates} slot keyed by component name, where a host can read, write, save and
 * restore them, and where every write passes through {@link ComponentStates.write} with its
 * previous and new value.
 *
 * Values are plain data: numbers, strings, booleans, `null`, arrays and plain objects. Another
 * entity is named by its id. That is the subset of a world's plain data that a JSON record keeps
 * unchanged, which is how the server saves an entity.
 */

import { isRecord } from './components/schemas';

/** A value a component state may hold anywhere below its top level. */
export type ComponentStateData =
    null | boolean | number | string | readonly ComponentStateData[] | ComponentStateRecord;

/**
 * One component's state: a plain object whose fields are {@link ComponentStateData}.
 *
 * The top level is always an object, never `null`, so `null` can stand for "no state" wherever a
 * write is described by its before and after values.
 */
export type ComponentStateRecord = { readonly [field: string]: ComponentStateData };

/** Checks that an unknown value is one field of a component's state, narrowing it to `T`. */
export type ComponentStateGuard<T extends ComponentStateData> = (value: unknown) => value is T;

/** The type a {@link ComponentStateGuard} narrows to. */
type Guarded<G> = G extends ComponentStateGuard<infer T> ? T : never;

/** The state shape that a map of field guards describes. */
export type ComponentStateShape<F extends Readonly<Record<string, ComponentStateGuard<ComponentStateData>>>> = {
    readonly [K in keyof F]: Guarded<F[K]>;
};

/**
 * A component's declaration of its state: which component it belongs to and what shape it has.
 *
 * The declaration is the typed accessor. {@link ComponentStates.get} and
 * {@link ComponentStates.set} take it and return or accept `S`, and the guard checks every value
 * that arrives untyped, from a save or from a host's undo, before a component can read it.
 */
export interface ComponentStateKey<S extends ComponentStateRecord> {
    /** The component name the state is filed under, such as `minecraft:breathable`. */
    readonly component: string;
    /** Whether a value has this state's shape. */
    readonly is: (value: unknown) => value is S;
}

/** Field guards for {@link defineComponentState}. */
export const stateField = {
    /** A finite or infinite number. */
    number: (value: unknown): value is number => typeof value === 'number',
    /** A boolean. */
    boolean: (value: unknown): value is boolean => typeof value === 'boolean',
    /** An entity id, as the filter views report one. */
    id: (value: unknown): value is string | number => typeof value === 'string' || typeof value === 'number',
    /** A field that may also be `null`. */
    nullable:
        <T extends ComponentStateData>(guard: ComponentStateGuard<T>): ComponentStateGuard<T | null> =>
        (value): value is T | null =>
            value === null || guard(value),
    /** A list whose every entry passes the guard. */
    list:
        <T extends ComponentStateData>(guard: ComponentStateGuard<T>): ComponentStateGuard<readonly T[]> =>
        (value): value is readonly T[] =>
            Array.isArray(value) && value.every(guard)
} as const;

/**
 * Declares one component's state, once, by its field guards.
 *
 * A component holds no state of its own; it reads and writes through the key this returns.
 *
 * @param component - The component name, which is also the slot key.
 * @param fields - One guard per field. The state type is derived from them.
 * @example
 * ```typescript
 * const AIR = defineComponentState('minecraft:breathable', {
 *     remaining: stateField.number,
 *     untilHurt: stateField.number
 * });
 * entity.componentState.set(AIR, { remaining: 300, untilHurt: 10 });
 * ```
 */
export const defineComponentState = <const F extends Readonly<Record<string, ComponentStateGuard<ComponentStateData>>>>(
    component: string,
    fields: F
): ComponentStateKey<ComponentStateShape<F>> => {
    const names = Object.keys(fields);
    return {
        component,
        is: (value): value is ComponentStateShape<F> =>
            isRecord(value) && names.every((name) => fields[name]?.(value[name]) === true)
    };
};

/** Whether an unknown value, such as one parsed from a save, is plain component state data. */
const isStateData = (value: unknown): value is ComponentStateData => {
    if (value === null) return true;
    switch (typeof value) {
        case 'boolean':
        case 'number':
        case 'string':
            return true;
        case 'object':
            return Array.isArray(value) ? value.every(isStateData) : isComponentStateRecord(value);
        default:
            return false;
    }
};

/** Whether an unknown value is a plain object of {@link ComponentStateData}. */
export const isComponentStateRecord = (value: unknown): value is ComponentStateRecord =>
    isRecord(value) && Object.getPrototypeOf(value) === Object.prototype && Object.values(value).every(isStateData);

/** Narrows a state value to a list; `Array.isArray` leaves a readonly list in its false branch. */
const isList = (value: ComponentStateData): value is readonly ComponentStateData[] => Array.isArray(value);

/** Whether two state values hold the same data, field by field. */
const sameData = (left: ComponentStateData, right: ComponentStateData): boolean => {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
    if (isList(left) || isList(right)) {
        if (!isList(left) || !isList(right) || left.length !== right.length) return false;
        return left.every((entry, index) => {
            const other = right[index];
            return other !== undefined && sameData(entry, other);
        });
    }
    const fields = Object.keys(left);
    if (fields.length !== Object.keys(right).length) return false;
    return fields.every((field) => {
        const mine = left[field];
        const other = right[field];
        return mine !== undefined && other !== undefined && sameData(mine, other);
    });
};

/** Freezes a state value all the way down, so a before-value handed to a host cannot change later. */
const deepFreeze = <T extends ComponentStateData>(value: T): T => {
    if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
    for (const field of Object.values(value)) deepFreeze(field);
    return Object.freeze(value);
};

/**
 * One write to a component's state, as the host observes it.
 *
 * `null` means "no state", so writing `before` back undoes the write exactly.
 */
export interface ComponentStateWrite {
    /** The component whose state changed. */
    readonly component: string;
    /** The state before the write, or `null` when the component held none. */
    readonly before: ComponentStateRecord | null;
    /** The state after the write, or `null` when the write cleared it. */
    readonly after: ComponentStateRecord | null;
}

/**
 * The saved form of an entity's component state: every active component that declared state,
 * by name, with `null` for one that holds none right now.
 *
 * A component missing from a saved form keeps whatever its `onInitialize` set, which is how a
 * record written before component state was saved loads.
 */
export type ComponentStateSnapshot = Readonly<Record<string, ComponentStateRecord | null>>;

/** What a {@link ComponentStates} slot needs from the entity that owns it. */
export interface ComponentStatesOwner {
    /** Whether the component is active on the entity now. */
    hasComponent(component: string): boolean;
    /** Called after every write that changed a value. */
    written(write: ComponentStateWrite): void;
}

/**
 * An entity's component state, keyed by component name.
 *
 * Components use {@link ComponentStates.get}, {@link ComponentStates.set} and
 * {@link ComponentStates.clear} with their declared key. A host uses
 * {@link ComponentStates.entries}, {@link ComponentStates.snapshot},
 * {@link ComponentStates.restore} and {@link ComponentStates.write}. All of them write through
 * {@link ComponentStates.write}, which reports each change to the owner.
 *
 * Every value is frozen when it is written. A component that changes its state writes a new
 * value; it never edits the one it read.
 */
export class ComponentStates {
    private readonly values = new Map<string, ComponentStateRecord>();
    private readonly keys = new Map<string, ComponentStateKey<ComponentStateRecord>>();

    public constructor(private readonly owner: ComponentStatesOwner) {}

    /**
     * A component's state, or undefined when it holds none.
     *
     * A stored value that fails the key's guard reads as undefined, so a component never sees a
     * shape it did not declare.
     *
     * @throws {Error} When another declaration already claimed the component name.
     */
    public get<S extends ComponentStateRecord>(key: ComponentStateKey<S>): S | undefined {
        this.claim(key);
        const value = this.values.get(key.component);
        return value !== undefined && key.is(value) ? value : undefined;
    }

    /**
     * Replaces a component's state.
     *
     * @throws {Error} When another declaration already claimed the component name.
     */
    public set<S extends ComponentStateRecord>(key: ComponentStateKey<S>, value: NoInfer<S>): void {
        this.claim(key);
        this.write(key.component, value);
    }

    /**
     * Removes a component's state, which is what a finished timer leaves.
     *
     * @throws {Error} When another declaration already claimed the component name.
     */
    public clear<S extends ComponentStateRecord>(key: ComponentStateKey<S>): void {
        this.claim(key);
        this.write(key.component, null);
    }

    /**
     * The one write path. Every change to the slot, whether from a component, a restore or a
     * host's undo, comes through here and is reported to the owner with its before and after
     * values. A write of a value equal, field by field, to the one held changes nothing and
     * reports nothing, so a component may write its state every tick without filling a log.
     *
     * @param component - The component whose state is written.
     * @param value - The new state, or `null` to remove it.
     * @returns False, and nothing written, when the component declared a shape the value fails.
     */
    public write(component: string, value: ComponentStateRecord | null): boolean {
        const key = this.keys.get(component);
        if (value !== null && key !== undefined && !key.is(value)) return false;

        const before = this.values.get(component) ?? null;
        if (before === value || (before !== null && value !== null && sameData(before, value))) return true;
        if (value === null) this.values.delete(component);
        else this.values.set(component, deepFreeze(value));
        this.owner.written({ component, before, after: value });
        return true;
    }

    /** Every component that holds state now, with that state, in the order each was first written. */
    public entries(): IterableIterator<[component: string, state: ComponentStateRecord]> {
        return this.values.entries();
    }

    /**
     * The saved form: each active component that has declared state, sorted by name, so two
     * entities in the same state save the same form.
     */
    public snapshot(): ComponentStateSnapshot {
        const saved: Record<string, ComponentStateRecord | null> = {};
        for (const component of [...this.keys.keys()].sort()) {
            if (!this.owner.hasComponent(component)) continue;
            saved[component] = this.values.get(component) ?? null;
        }
        return saved;
    }

    /**
     * Writes a saved form back after the entity's components have initialized.
     *
     * Only active components are written. A component the form leaves out keeps the state its
     * `onInitialize` set, and a value that is not plain data, or fails the component's declared
     * shape, is skipped in the same way.
     *
     * @param saved - A saved form, possibly parsed from an older or damaged record.
     * @returns The names of the components whose saved value was skipped as malformed.
     */
    public restore(saved: Readonly<Record<string, unknown>>): readonly string[] {
        const skipped: string[] = [];
        for (const [component, value] of Object.entries(saved)) {
            if (!this.owner.hasComponent(component)) continue;
            const accepted = (value === null || isComponentStateRecord(value)) && this.write(component, value);
            if (!accepted) skipped.push(component);
        }
        return skipped;
    }

    private claim<S extends ComponentStateRecord>(key: ComponentStateKey<S>): void {
        const known = this.keys.get(key.component);
        if (known === key) return;
        if (known !== undefined) throw new Error(`${key.component} declares its component state twice`);
        this.keys.set(key.component, key);
    }
}
