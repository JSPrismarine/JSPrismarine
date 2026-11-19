import { engineFunctionSource } from '../engineSource';
import type { RuntimeArgument, RuntimeCall, RuntimeExport, RuntimeMember, RuntimePlan, RuntimeType } from './plan';

/**
 * The host function the runtime calls for every member: the member's id, `this`, the tag and the
 * state the host gave `this` when it made the instance (0 and an empty string when it gave none,
 * or for a static member), and the checked arguments.
 */
export type RuntimeHost = (id: number, self: unknown, tag: number, state: string, ...args: unknown[]) => unknown;

/** What {@link engineRuntime} returns inside the engine. */
export interface EngineRuntime {
    /** Installs one module from its {@link RuntimePlan}, as JSON, and returns its namespace object. */
    bind(plan: string): object;
    /**
     * Makes an instance of a bound class without running its constructor, for the host to hand
     * out. Its members receive `tag` and `state`, which the host uses to find what the instance
     * stands for, such as an entity's id.
     */
    create(module: string, name: string, tag: number, state: string): object;
    /** Replaces the state an instance's members receive, for a member that changes its own object. */
    setState(instance: object, state: string): void;
    /** The state of an instance the host made, or an empty string for any other value. */
    stateOf(value: unknown): string;
    /**
     * A plain value as JSON, read with the built-ins as they were before any script ran, or
     * undefined when it has none, such as a cycle or a function.
     */
    stringify(value: unknown): string | undefined;
    /**
     * Makes the host call that is running throw an instance of a bound error class when it returns.
     * @param fields - The error's property values as JSON, or an empty string.
     */
    raise(module: string, name: string, message: string, fields: string): void;
    /**
     * Makes an instance of a bound error class without throwing it, for the host to reject a
     * promise with.
     * @param fields - The error's property values as JSON, or an empty string.
     */
    error(module: string, name: string, message: string, fields: string): Error;
    /** The tag the host gave an instance, or -1 for a value the host did not make. */
    tag(value: unknown): number;
    /** The state an instance's members receive, or an empty string when it has none. */
    state(value: unknown): string;
}

/**
 * The part of the binding that runs inside a script engine, never in Node.js: the binding
 * evaluates {@link engineRuntimeSource} there and calls the function it gets once per context.
 * It must not refer to anything outside its own body.
 *
 * Every member it installs checks its arguments against the metadata before it calls the host,
 * and an instance member checks that `this` is an instance the host made. A module function
 * passes the host no `this`. The messages are BDS's, as the `argument-errors` scenario of the
 * parity suite's `scripting.engine` family records them.
 */
export function engineRuntime(host: RuntimeHost): EngineRuntime {
    // Scripts share this realm and can replace any built-in, so every check below calls copies of
    // the built-ins taken now, before a pack's code runs, and never looks one up on a value.
    const { apply } = Reflect;
    const { create: createObject, defineProperty, getOwnPropertyDescriptor, setPrototypeOf } = Object;
    const { isArray } = Array;
    const { isFinite, isInteger } = Number;
    const { parse, stringify } = JSON;
    const { Error, TypeError, ReferenceError, Map, Set, WeakMap, String, BigInt } = globalThis;
    const iterator = Symbol.iterator;
    const uncurry =
        <This, Args extends unknown[], Result>(fn: (this: This, ...args: Args) => Result) =>
        (self: This, ...args: Args): Result =>
            apply(fn, self, args);
    const isPrototypeOf = uncurry(Object.prototype.isPrototypeOf);
    const toFixed = uncurry(Number.prototype.toFixed);
    // The uncurried accessors lose the collections' type parameters, which these restore.
    const mapGet = uncurry(Map.prototype.get) as <V>(map: Map<string, V>, key: string) => V | undefined;
    const mapSet = uncurry(Map.prototype.set);
    const setHas = uncurry(Set.prototype.has);
    const weakGet = uncurry(WeakMap.prototype.get) as <V>(map: WeakMap<object, V>, key: object) => V | undefined;
    const weakSet = uncurry(WeakMap.prototype.set);
    const weakHas = uncurry(WeakMap.prototype.has);
    const COMMON = '@minecraft/common';
    type NativeClass = { readonly prototype: object };
    type NativeError = new (...args: unknown[]) => Error;
    const classes = new Map<string, NativeClass>();
    const errors = new Map<string, NativeError>();
    const enums = new Map<string, ReadonlySet<unknown>>();
    const errorFields = new WeakMap<object, Readonly<Record<string, unknown>>>();
    /** Every instance the host made or a constructor built, with the tag its members receive. */
    const bound = new WeakMap<object, number>();
    /**
     * The state of each instance that has one, which its members receive. It lives as long as the
     * instance does, so a value the host gives an object, such as an item stack, needs no table
     * in the host that a script's garbage would grow.
     */
    const states = new WeakMap<object, string>();
    /** Set while the runtime constructs an error itself, which scripts may not. */
    let internal = false;
    let pending: { readonly error: unknown } | undefined;

    const key = (module: string, name: string): string => `${module}\n${name}`;
    const define = (target: object, name: PropertyKey, descriptor: PropertyDescriptor): void => {
        defineProperty(target, name, descriptor);
    };

    const makeError = (module: string, name: string, message: string, fields?: Readonly<Record<string, unknown>>) => {
        const ErrorClass = mapGet(errors, key(module, name));
        let error: Error;
        if (ErrorClass === undefined) {
            // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, and the script gets the native error BDS throws.
            error = new Error(message);
            define(error, 'name', { value: name, writable: true, configurable: true });
        } else {
            internal = true;
            try {
                error = new ErrorClass(message);
            } finally {
                internal = false;
            }
        }
        if (fields !== undefined) weakSet(errorFields, error, fields);
        return error;
    };

    /**
     * Makes an own element. Assigning to an index instead would call a setter a script put on
     * `Array.prototype`, which could swallow the value and hand back its own through a getter.
     */
    const put = (target: unknown[], index: number, value: unknown): void => {
        defineProperty(target, index, { value, writable: true, enumerable: true, configurable: true });
    };

    /** Copies an array by index, which no replaced iterator or method can reach. */
    const copy = (values: readonly unknown[]): unknown[] => {
        const result: unknown[] = [];
        for (let index = 0; index < values.length; index++) put(result, index, values[index]);
        return result;
    };

    const isObject = (value: unknown): value is object =>
        (typeof value === 'object' || typeof value === 'function') && value !== null;
    const tagOf = (self: unknown): number => (isObject(self) ? (weakGet(bound, self) ?? 0) : 0);
    const stateOf = (self: unknown): string => (isObject(self) ? (weakGet(states, self) ?? '') : '');

    const invoke = (id: number, self: unknown, args: readonly unknown[]): unknown => {
        const list: unknown[] = [id, self, tagOf(self), stateOf(self)];
        for (let index = 0; index < args.length; index++) put(list, index + 4, args[index]);
        const result = apply(host, undefined, list);
        if (pending !== undefined) {
            const { error } = pending;
            pending = undefined;
            throw error;
        }
        return result;
    };

    const matches = (type: RuntimeType, value: unknown): boolean => {
        switch (type.kind) {
            case 'any':
            case 'host':
                return true;
            case 'boolean':
            case 'string':
            case 'number':
            case 'undefined':
            case 'function':
                return typeof value === type.kind;
            case 'object':
                // An interface such as RawMessage is a plain object; BDS refuses an array for one.
                return typeof value === 'object' && value !== null && !isArray(value);
            case 'instance': {
                const Class =
                    mapGet(classes, key(type.module, type.name)) ?? mapGet(errors, key(type.module, type.name));
                if (Class === undefined) return typeof value === 'object' && value !== null;
                return typeof value === 'object' && value !== null && isPrototypeOf(Class.prototype, value);
            }
            case 'enum': {
                const values = mapGet(enums, key(type.module, type.name));
                return values === undefined || setHas(values, value);
            }
            case 'array': {
                if (!isArray(value)) return false;
                for (let index = 0; index < value.length; index++) {
                    if (!matches(type.element, value[index])) return false;
                }
                return true;
            }
            case 'optional':
                return value === undefined || matches(type.type, value);
            case 'variant':
                for (let index = 0; index < type.types.length; index++) {
                    const each = type.types[index];
                    if (each !== undefined && matches(each, value)) return true;
                }
                return false;
        }
    };

    /**
     * Where BDS lists a variant's type in its conversion errors: a primitive first, then a class or
     * an interface, then an array, each group in the metadata's order. The goldens hold
     * `string | ItemType`, `string | RawMessage | (string | RawMessage)[]` and
     * `DimensionLocation | Vector3`.
     */
    const variantRank = (type: RuntimeType): number => {
        switch (type.kind) {
            case 'boolean':
            case 'string':
            case 'number':
            case 'undefined':
                return 0;
            case 'array':
                return 2;
            default:
                return 1;
        }
    };

    /** A type as BDS's conversion errors write it. */
    const describe = (type: RuntimeType): string => {
        switch (type.kind) {
            case 'instance':
            case 'enum':
            case 'object':
                return type.name;
            case 'function':
                return `Closure: ${type.signature}`;
            case 'array': {
                const element = describe(type.element);
                return type.element.kind === 'variant' ? `(${element})[]` : `${element}[]`;
            }
            case 'optional':
                return `${describe(type.type)} | undefined`;
            case 'variant': {
                let text = '';
                for (let rank = 0; rank < 3; rank++) {
                    for (let index = 0; index < type.types.length; index++) {
                        const each = type.types[index];
                        if (each !== undefined && variantRank(each) === rank) {
                            text += `${text === '' ? '' : ' | '}${describe(each)}`;
                        }
                    }
                }
                return text;
            }
            default:
                return type.kind;
        }
    };

    /**
     * A bound as BDS writes it: a whole number in the int32 range as it is, anything else with two
     * decimals and every digit, as `printf` writes it. `toFixed` writes an exponent from 1e21 on, so
     * a whole number that large, such as the float range's end, is written through `BigInt`.
     */
    const bound32 = (value: number): string => {
        if (isInteger(value) && value >= -2147483648 && value <= 2147483647) return String(value);
        if (isInteger(value) && (value >= 1e21 || value <= -1e21)) return `${String(BigInt(value))}.00`;
        return toFixed(value, 2);
    };

    const outOfBounds = (index: number, value: number, min?: number, max?: number): Error => {
        const bounds =
            min !== undefined && max !== undefined
                ? `Argument bounds: [${bound32(min)}, ${bound32(max)}]`
                : min !== undefined
                  ? `Argument min: ${bound32(min)}`
                  : `Argument max: ${bound32(max ?? 0)}`;
        return makeError(
            COMMON,
            'ArgumentOutOfBoundsError',
            `Unsupported or out of bounds value passed to function argument [${index}]. Value: ${bound32(value)}, ${bounds}`,
            { index, value, minValue: min, maxValue: max }
        );
    };

    /** The largest finite float, which BDS gives a float property's open side of its bounds. */
    const FLOAT_MAX = 3.4028234663852886e38;

    /**
     * What BDS throws for a value set on a property outside its bounds, such as `ItemStack.amount
     * = 0`. A float property with an open side leaves out the value and closes that side with the
     * float range ({@link RuntimeArgument.float}); one with both bounds, as `PrimitiveShape.scale`,
     * gives the value as an integer property does.
     */
    const propertyOutOfBounds = (name: string, value: number, argument: RuntimeArgument): Error => {
        const { min, max } = argument;
        if (argument.float === true && (min === undefined || max === undefined)) {
            const low = min ?? -FLOAT_MAX;
            const high = max ?? FLOAT_MAX;
            return makeError(
                COMMON,
                'PropertyOutOfBoundsError',
                `Unsupported or out of bounds value set on Property: ${name}, Property bounds: [${bound32(low)}, ${bound32(high)}]`,
                { value, minValue: low, maxValue: high }
            );
        }
        const bounds =
            min !== undefined && max !== undefined
                ? `Property bounds: [${bound32(min)}, ${bound32(max)}]`
                : min !== undefined
                  ? `Property min: ${bound32(min)}`
                  : `Property max: ${bound32(max ?? 0)}`;
        return makeError(
            COMMON,
            'PropertyOutOfBoundsError',
            `Unsupported or out of bounds value set on Property: ${name}, Value: ${value}, ${bounds}`,
            { value, minValue: min, maxValue: max }
        );
    };

    /**
     * Checks a call's arguments and fills in omitted defaults.
     * @param property - The property a setter's one argument is for. BDS names a setter's value
     *   `Function return value` in its conversion errors, and the property in a bounds error.
     */
    const check = (call: RuntimeCall, args: readonly unknown[], property?: string): unknown[] => {
        if (args.length < call.required || args.length > call.arguments.length) {
            const expected =
                call.required === call.arguments.length
                    ? `${call.required}`
                    : `${call.required}-${call.arguments.length}`;
            // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, and the script gets the native error BDS throws.
            throw new TypeError(
                `Incorrect number of arguments to function. Expected ${expected}, received ${args.length}`
            );
        }
        const checked = copy(args);
        for (let index = 0; index < call.arguments.length; index++) {
            const argument = call.arguments[index];
            if (argument === undefined) continue;
            // An omitted argument has no element, and reading one would reach a getter on the prototype.
            const value = index < checked.length ? checked[index] : undefined;
            if (value === undefined && argument.optional) {
                if (argument.default !== undefined) put(checked, index, argument.default);
                continue;
            }
            const target = property === undefined ? `Function argument [${index}]` : 'Function return value';
            if (!matches(argument.type, value)) {
                const inner = argument.type.kind === 'optional' ? argument.type.type : argument.type;
                // An object that is not one the host made, where a class's instance belongs.
                const unbound =
                    inner.kind === 'instance' && typeof value === 'object' && value !== null && !weakHas(bound, value);
                const conversion = unbound
                    ? 'Object did not have a native handle.'
                    : inner.kind === 'variant'
                      ? 'Native variant type conversion failed.'
                      : 'Native type conversion failed.';
                // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, and the script gets the native error BDS throws.
                throw new TypeError(`${conversion} ${target} expected type: ${describe(argument.type)}`);
            }
            if (typeof value === 'number' && argument.type.kind !== 'host') {
                // BDS refuses NaN and an infinity before it checks any bounds.
                if (!isFinite(value)) {
                    // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, and the script gets the native error BDS throws.
                    throw new TypeError(
                        `${value} value is not supported. ${target} expected type: ${describe(argument.type)}`
                    );
                }
                const low = argument.min !== undefined && value < argument.min;
                const high = argument.max !== undefined && value > argument.max;
                if (low || high) {
                    throw property === undefined
                        ? outOfBounds(index, value, argument.min, argument.max)
                        : propertyOutOfBounds(property, value, argument);
                }
            }
            if (typeof value === 'string' && argument.maxLength !== undefined && value.length > argument.maxLength) {
                throw outOfBounds(index, value.length, undefined, argument.maxLength);
            }
        }
        return checked;
    };

    /** Throws BDS's error for an instance member called on something the host did not make. */
    const checkReceiver = (self: unknown, label: string | undefined): void => {
        if (label === undefined) return;
        if ((typeof self === 'object' || typeof self === 'function') && self !== null && weakHas(bound, self)) return;
        // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, and the script gets the native error BDS throws.
        throw new ReferenceError(`${label} object bound to prototype does not exist.`);
    };

    /** A result the host passed as JSON, parsed; any other result as it is. */
    const decode = (json: boolean | undefined, result: unknown): unknown =>
        json === true && typeof result === 'string' ? parse(result) : result;

    /**
     * @param receiver - How BDS names the member in a receiver error, such as `Native function
     *   [World::getDimension]`; undefined for a static member or a module function.
     */
    const method = (name: string, call: RuntimeCall, receiver?: string): ((...args: unknown[]) => unknown) => {
        const holder = {
            [name](this: unknown, ...args: unknown[]): unknown {
                const checked = check(call, args);
                checkReceiver(this, receiver);
                return decode(call.json, invoke(call.id, this, checked));
            }
        };
        const fn = holder[name];
        // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, which cannot load the catalog, and only a binding bug throws it.
        if (fn === undefined) throw new ReferenceError(`The method ${name} was not made`);
        return fn;
    };

    /** A module function, which passes the host no `this` whatever it was called on. */
    const moduleFunction = (name: string, call: RuntimeCall): ((...args: unknown[]) => unknown) => {
        const holder = {
            [name](...args: unknown[]): unknown {
                return decode(call.json, invoke(call.id, undefined, check(call, args)));
            }
        };
        const fn = holder[name];
        // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, which cannot load the catalog, and only a binding bug throws it.
        if (fn === undefined) throw new ReferenceError(`The function ${name} was not made`);
        return fn;
    };

    /**
     * A property's getter and setter. A read-only property's setter throws, as BDS's does.
     * @param owner - The class, for receiver errors; undefined for a static property.
     */
    const accessors = (
        name: string,
        get: number,
        json: boolean | undefined,
        set: RuntimeCall | undefined,
        owner: string | undefined
    ): PropertyDescriptor => {
        const holder = {
            get [name](): unknown {
                checkReceiver(this, owner === undefined ? undefined : `Native property getter [${owner}::${name}]`);
                return decode(json, invoke(get, this, []));
            },
            set [name](value: unknown) {
                // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, and the script gets the native error BDS throws.
                if (set === undefined) throw new TypeError(`'${name}' is read-only`);
                const checked = check(set, [value], name);
                checkReceiver(this, owner === undefined ? undefined : `Native property setter [${owner}::${name}]`);
                invoke(set.id, this, checked);
            }
        };
        const descriptor = getOwnPropertyDescriptor(holder, name) ?? {};
        return { get: descriptor.get, set: descriptor.set, configurable: true };
    };

    const installMember = (target: object, member: RuntimeMember, owner: string): void => {
        if (member.kind === 'method') {
            define(target, member.name, {
                value: method(
                    member.name,
                    member.call,
                    member.static ? undefined : `Native function [${owner}::${member.name}]`
                ),
                writable: true,
                configurable: true
            });
        } else if (member.kind === 'property') {
            define(
                target,
                member.name,
                accessors(member.name, member.get, member.json, member.set, member.static ? undefined : owner)
            );
        } else {
            define(target, member.name, { value: member.value, enumerable: true });
        }
    };

    const noConstructor = (name: string): ReferenceError =>
        // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, and the script gets the native error BDS throws.
        new ReferenceError(`No constructor for native class '${name}'.`);

    const bindClass = (module: string, entry: Extract<RuntimeExport, { kind: 'class' }>): NativeClass => {
        const { name, construct } = entry;
        const holder = {
            [name]: function (this: object, ...args: unknown[]): void {
                // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, and the script gets the native error BDS throws.
                if (new.target === undefined) throw new TypeError('must be called with new');
                if (construct === undefined) throw noConstructor(name);
                const checked = check(construct, args);
                weakSet(bound, this, 0);
                // A constructor's implementation returns the new object's state, when it has one.
                const state = invoke(construct.id, this, checked);
                if (typeof state === 'string') weakSet(states, this, state);
            }
        };
        const Class = holder[name];
        // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, which cannot load the catalog, and only a binding bug throws it.
        if (Class === undefined) throw new ReferenceError(`The class ${name} was not made`);
        if (entry.base !== undefined) {
            const Base = mapGet(classes, key(entry.base.module, entry.base.name));
            // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, which cannot load the catalog, and only a binding bug throws it.
            if (Base === undefined) throw new ReferenceError(`${name} extends ${entry.base.name}, which is not bound`);
            setPrototypeOf(Class.prototype, Base.prototype);
            setPrototypeOf(Class, Base);
        }
        for (const member of entry.members) installMember(member.static ? Class : Class.prototype, member, name);
        if (entry.iterable) {
            define(Class.prototype, iterator, {
                value: function (this: unknown) {
                    return this;
                },
                writable: true,
                configurable: true
            });
        }
        define(Class, 'prototype', { writable: false });
        mapSet(classes, key(module, name), Class);
        return Class;
    };

    const bindError = (module: string, entry: Extract<RuntimeExport, { kind: 'error' }>): NativeError => {
        const { name, construct } = entry;
        const holder = {
            // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine; the Script API error classes a script catches extend Error, as on BDS.
            [name]: class extends Error {
                public constructor(...args: unknown[]) {
                    if (internal) {
                        super(typeof args[0] === 'string' ? args[0] : undefined);
                        return;
                    }
                    if (construct === undefined) throw noConstructor(name);
                    const checked = check(construct, args);
                    super();
                    invoke(construct.id, this, checked);
                }
            }
        };
        const ErrorClass = holder[name];
        // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, which cannot load the catalog, and only a binding bug throws it.
        if (ErrorClass === undefined) throw new ReferenceError(`The error class ${name} was not made`);
        define(ErrorClass.prototype, 'name', { value: name, writable: true, configurable: true });
        for (const property of entry.properties) {
            define(ErrorClass.prototype, property, {
                get(this: object) {
                    return weakGet(errorFields, this)?.[property];
                },
                configurable: true
            });
        }
        mapSet(errors, key(module, name), ErrorClass);
        return ErrorClass;
    };

    const create = (module: string, name: string, tag: number, state: string): object => {
        const Class = mapGet(classes, key(module, name));
        // biome-ignore lint/plugin/no-raw-errors: runs inside the script engine, which cannot load the catalog, and only a binding bug throws it.
        if (Class === undefined) throw new ReferenceError(`${module} has no bound class ${name}`);
        const instance = createObject(Class.prototype);
        weakSet(bound, instance, tag);
        if (state !== '') weakSet(states, instance, state);
        return instance;
    };

    const bindExport = (module: string, entry: RuntimeExport): unknown => {
        switch (entry.kind) {
            case 'class':
                return bindClass(module, entry);
            case 'error':
                return bindError(module, entry);
            case 'enum': {
                const values: Record<string, unknown> = {};
                for (const [name, value] of entry.values) define(values, name, { value, enumerable: true });
                mapSet(enums, key(module, entry.name), new Set(entry.values.map(([, value]) => value)));
                return values;
            }
            case 'constant':
                return entry.value;
            case 'object':
                return create(entry.module, entry.className, 0, '');
            case 'function':
                return moduleFunction(entry.name, entry.call);
        }
    };

    return {
        bind(planJson: string): object {
            const plan: RuntimePlan = parse(planJson);
            const values = new Map<string, unknown>();
            for (const entry of plan.exports) values.set(entry.name, bindExport(plan.module, entry));
            // A module namespace lists its names in code unit order and has no prototype.
            const namespace = createObject(null);
            for (const name of [...values.keys()].sort())
                define(namespace, name, { value: values.get(name), enumerable: true });
            return namespace;
        },
        create,
        setState(instance: object, state: string): void {
            if (weakHas(bound, instance)) weakSet(states, instance, state);
        },
        stateOf,
        stringify(value: unknown): string | undefined {
            try {
                return stringify(value);
            } catch {
                return undefined;
            }
        },
        raise(module: string, name: string, message: string, fields: string): void {
            pending = { error: makeError(module, name, message, fields === '' ? undefined : parse(fields)) };
        },
        error(module: string, name: string, message: string, fields: string): Error {
            return makeError(module, name, message, fields === '' ? undefined : parse(fields));
        },
        tag(value: unknown): number {
            if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return -1;
            return weakHas(bound, value) ? (weakGet(bound, value) ?? 0) : -1;
        },
        state(value: unknown): string {
            return stateOf(value);
        }
    };
}

/** The source text that evaluates, inside an engine, to {@link engineRuntime}. */
export const engineRuntimeSource = (): string => engineFunctionSource(engineRuntime.toString());
