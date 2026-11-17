import type { RuntimeCall, RuntimeExport, RuntimeMember, RuntimePlan, RuntimeType } from './plan';

/**
 * The host function the runtime calls for every member: the member's id, `this`, the tag the host
 * gave `this` when it made the instance (0 when it gave none, or for a static member), and the
 * checked arguments.
 */
export type RuntimeHost = (id: number, self: unknown, tag: number, ...args: unknown[]) => unknown;

/** What {@link engineRuntime} returns inside the engine. */
export interface EngineRuntime {
    /** Installs one module from its {@link RuntimePlan}, as JSON, and returns its namespace object. */
    bind(plan: string): object;
    /**
     * Makes an instance of a bound class without running its constructor, for the host to hand
     * out. Its members receive `tag`, which the host uses to find what the instance stands for.
     */
    create(module: string, name: string, tag: number): object;
    /**
     * Makes the host call that is running throw an instance of a bound error class when it returns.
     * @param fields - The error's property values as JSON, or an empty string.
     */
    raise(module: string, name: string, message: string, fields: string): void;
}

/**
 * The part of the binding that runs inside a script engine, never in Node.js: the binding
 * evaluates {@link engineRuntimeSource} there and calls the function it gets once per context.
 * It must not refer to anything outside its own body.
 *
 * Every member it installs checks its arguments against the metadata before it calls the host,
 * and an instance member checks that `this` is an instance the host made. The messages are BDS's,
 * as the `argument-errors` scenario of the parity suite's `scripting.engine` family records them.
 */
export function engineRuntime(host: RuntimeHost): EngineRuntime {
    const COMMON = '@minecraft/common';
    type NativeClass = { readonly prototype: object };
    type NativeError = new (...args: unknown[]) => Error;
    const classes = new Map<string, NativeClass>();
    const errors = new Map<string, NativeError>();
    const enums = new Map<string, ReadonlySet<unknown>>();
    const errorFields = new WeakMap<object, Readonly<Record<string, unknown>>>();
    /** Every instance the host made or a constructor built, with the tag its members receive. */
    const bound = new WeakMap<object, number>();
    /** Set while the runtime constructs an error itself, which scripts may not. */
    let internal = false;
    let pending: { readonly error: unknown } | undefined;

    const key = (module: string, name: string): string => `${module}\n${name}`;
    const define = (target: object, name: PropertyKey, descriptor: PropertyDescriptor): void => {
        Object.defineProperty(target, name, descriptor);
    };

    const makeError = (module: string, name: string, message: string, fields?: Readonly<Record<string, unknown>>) => {
        const ErrorClass = errors.get(key(module, name));
        let error: Error;
        if (ErrorClass === undefined) {
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
        if (fields !== undefined) errorFields.set(error, fields);
        return error;
    };

    const tagOf = (self: unknown): number =>
        (typeof self === 'object' || typeof self === 'function') && self !== null ? (bound.get(self) ?? 0) : 0;

    const invoke = (id: number, self: unknown, args: readonly unknown[]): unknown => {
        const result = host(id, self, tagOf(self), ...args);
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
                return true;
            case 'boolean':
            case 'string':
            case 'number':
            case 'undefined':
            case 'function':
                return typeof value === type.kind;
            case 'object':
                // An interface such as RawMessage is a plain object; BDS refuses an array for one.
                return typeof value === 'object' && value !== null && !Array.isArray(value);
            case 'instance': {
                const Class = classes.get(key(type.module, type.name)) ?? errors.get(key(type.module, type.name));
                if (Class === undefined) return typeof value === 'object' && value !== null;
                return typeof value === 'object' && value !== null && Class.prototype.isPrototypeOf(value);
            }
            case 'enum': {
                const values = enums.get(key(type.module, type.name));
                return values === undefined || values.has(value);
            }
            case 'array':
                return Array.isArray(value) && value.every((element) => matches(type.element, element));
            case 'optional':
                return value === undefined || matches(type.type, value);
            case 'variant':
                return type.types.some((each) => matches(each, value));
        }
    };

    /** A type as BDS's conversion errors write it. A variant lists its types last to first. */
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
            case 'variant':
                return [...type.types].reverse().map(describe).join(' | ');
            default:
                return type.kind;
        }
    };

    /** A bound as BDS writes it: a whole number in the int32 range as it is, anything else with two decimals. */
    const bound32 = (value: number): string =>
        Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 ? String(value) : value.toFixed(2);

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
            `Unsupported or out of bounds value passed to function argument [${index}]. Value: ${value}, ${bounds}`,
            { index, value, minValue: min, maxValue: max }
        );
    };

    /** Checks a call's arguments and fills in omitted defaults. */
    const check = (call: RuntimeCall, args: readonly unknown[]): unknown[] => {
        if (args.length < call.required || args.length > call.arguments.length) {
            const expected =
                call.required === call.arguments.length
                    ? `${call.required}`
                    : `${call.required}-${call.arguments.length}`;
            throw new TypeError(
                `Incorrect number of arguments to function. Expected ${expected}, received ${args.length}`
            );
        }
        const checked = [...args];
        call.arguments.forEach((argument, index) => {
            const value = checked[index];
            if (value === undefined && argument.optional) {
                if (argument.default !== undefined) checked[index] = argument.default;
                return;
            }
            if (!matches(argument.type, value)) {
                const inner = argument.type.kind === 'optional' ? argument.type.type : argument.type;
                const conversion =
                    inner.kind === 'variant' ? 'Native variant type conversion' : 'Native type conversion';
                throw new TypeError(
                    `${conversion} failed. Function argument [${index}] expected type: ${describe(argument.type)}`
                );
            }
            if (typeof value === 'number') {
                const low = argument.min !== undefined && value < argument.min;
                const high = argument.max !== undefined && value > argument.max;
                if (low || high) throw outOfBounds(index, value, argument.min, argument.max);
            }
            if (typeof value === 'string' && argument.maxLength !== undefined && value.length > argument.maxLength) {
                throw outOfBounds(index, value.length, undefined, argument.maxLength);
            }
        });
        return checked;
    };

    /** Throws BDS's error for an instance member called on something the host did not make. */
    const checkReceiver = (self: unknown, label: string | undefined): void => {
        if (label === undefined) return;
        if ((typeof self === 'object' || typeof self === 'function') && self !== null && bound.has(self)) return;
        throw new ReferenceError(`${label} object bound to prototype does not exist.`);
    };

    /**
     * @param receiver - How BDS names the member in a receiver error, such as `Native function
     *   [World::getDimension]`; undefined for a static member or a module function.
     */
    const method = (name: string, call: RuntimeCall, receiver?: string): ((...args: unknown[]) => unknown) => {
        const holder = {
            [name](this: unknown, ...args: unknown[]): unknown {
                const checked = check(call, args);
                checkReceiver(this, receiver);
                return invoke(call.id, this, checked);
            }
        };
        const fn = holder[name];
        if (fn === undefined) throw new ReferenceError(`The method ${name} was not made`);
        return fn;
    };

    /**
     * A property's getter and setter. A read-only property's setter throws, as BDS's does.
     * @param owner - The class, for receiver errors; undefined for a static property.
     */
    const accessors = (
        name: string,
        get: number,
        set: RuntimeCall | undefined,
        owner: string | undefined
    ): PropertyDescriptor => {
        const holder = {
            get [name](): unknown {
                checkReceiver(this, owner === undefined ? undefined : `Native property getter [${owner}::${name}]`);
                return invoke(get, this, []);
            },
            set [name](value: unknown) {
                if (set === undefined) throw new TypeError(`'${name}' is read-only`);
                const checked = check(set, [value]);
                checkReceiver(this, owner === undefined ? undefined : `Native property setter [${owner}::${name}]`);
                invoke(set.id, this, checked);
            }
        };
        const descriptor = Object.getOwnPropertyDescriptor(holder, name) ?? {};
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
                accessors(member.name, member.get, member.set, member.static ? undefined : owner)
            );
        } else {
            define(target, member.name, { value: member.value, enumerable: true });
        }
    };

    const noConstructor = (name: string): ReferenceError =>
        new ReferenceError(`No constructor for native class '${name}'.`);

    const bindClass = (module: string, entry: Extract<RuntimeExport, { kind: 'class' }>): NativeClass => {
        const { name, construct } = entry;
        const holder = {
            [name]: function (this: object, ...args: unknown[]): void {
                if (new.target === undefined) throw new TypeError('must be called with new');
                if (construct === undefined) throw noConstructor(name);
                const checked = check(construct, args);
                bound.set(this, 0);
                invoke(construct.id, this, checked);
            }
        };
        const Class = holder[name];
        if (Class === undefined) throw new ReferenceError(`The class ${name} was not made`);
        if (entry.base !== undefined) {
            const Base = classes.get(key(entry.base.module, entry.base.name));
            if (Base === undefined) throw new ReferenceError(`${name} extends ${entry.base.name}, which is not bound`);
            Object.setPrototypeOf(Class.prototype, Base.prototype);
            Object.setPrototypeOf(Class, Base);
        }
        for (const member of entry.members) installMember(member.static ? Class : Class.prototype, member, name);
        if (entry.iterable) {
            define(Class.prototype, Symbol.iterator, {
                value: function (this: unknown) {
                    return this;
                },
                writable: true,
                configurable: true
            });
        }
        define(Class, 'prototype', { writable: false });
        classes.set(key(module, name), Class);
        return Class;
    };

    const bindError = (module: string, entry: Extract<RuntimeExport, { kind: 'error' }>): NativeError => {
        const { name, construct } = entry;
        const holder = {
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
        if (ErrorClass === undefined) throw new ReferenceError(`The error class ${name} was not made`);
        define(ErrorClass.prototype, 'name', { value: name, writable: true, configurable: true });
        for (const property of entry.properties) {
            define(ErrorClass.prototype, property, {
                get(this: object) {
                    return errorFields.get(this)?.[property];
                },
                configurable: true
            });
        }
        errors.set(key(module, name), ErrorClass);
        return ErrorClass;
    };

    const create = (module: string, name: string, tag: number): object => {
        const Class = classes.get(key(module, name));
        if (Class === undefined) throw new ReferenceError(`${module} has no bound class ${name}`);
        const instance = Object.create(Class.prototype);
        bound.set(instance, tag);
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
                enums.set(key(module, entry.name), new Set(entry.values.map(([, value]) => value)));
                return values;
            }
            case 'constant':
                return entry.value;
            case 'object':
                return create(entry.module, entry.className, 0);
            case 'function':
                return method(entry.name, entry.call);
        }
    };

    return {
        bind(planJson: string): object {
            const plan: RuntimePlan = JSON.parse(planJson);
            const values = new Map<string, unknown>();
            for (const entry of plan.exports) values.set(entry.name, bindExport(plan.module, entry));
            // A module namespace lists its names in code unit order and has no prototype.
            const namespace = Object.create(null);
            for (const name of [...values.keys()].sort())
                define(namespace, name, { value: values.get(name), enumerable: true });
            return namespace;
        },
        create,
        raise(module: string, name: string, message: string, fields: string): void {
            pending = { error: makeError(module, name, message, fields === '' ? undefined : JSON.parse(fields)) };
        }
    };
}

/** The source text that evaluates, inside an engine, to {@link engineRuntime}. */
export const engineRuntimeSource = (): string => `(${engineRuntime.toString()})`;
