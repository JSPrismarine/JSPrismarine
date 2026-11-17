import type { RuntimeCall, RuntimeExport, RuntimeMember, RuntimePlan, RuntimeType } from './plan';

/** The host function the runtime calls for every member: the member's id, `this`, and the checked arguments. */
export type RuntimeHost = (id: number, self: unknown, ...args: unknown[]) => unknown;

/** What {@link engineRuntime} returns inside the engine. */
export interface EngineRuntime {
    /** Installs one module from its {@link RuntimePlan}, as JSON, and returns its namespace object. */
    bind(plan: string): object;
    /** Makes an instance of a bound class without running its constructor, for the host to hand out. */
    create(module: string, name: string): object;
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
 * Every member it installs checks its arguments against the metadata before it calls the host.
 * The research note records two of BDS's messages, `Native variant type conversion failed.` and the
 * `ArgumentOutOfBoundsError` text for an argument outside its bounds. The others follow the same
 * wording and wait on a `scripting.engine` parity row to confirm them: the conversion failure
 * for one type, `Incorrect number of arguments to function.`, and `No constructor for native class`.
 */
export function engineRuntime(host: RuntimeHost): EngineRuntime {
    const COMMON = '@minecraft/common';
    type NativeClass = { readonly prototype: object };
    type NativeError = new (...args: unknown[]) => Error;
    const classes = new Map<string, NativeClass>();
    const errors = new Map<string, NativeError>();
    const enums = new Map<string, ReadonlySet<unknown>>();
    const errorFields = new WeakMap<object, Readonly<Record<string, unknown>>>();
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

    const invoke = (id: number, self: unknown, args: readonly unknown[]): unknown => {
        const result = host(id, self, ...args);
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
                return typeof value === 'object' && value !== null;
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

    const describe = (type: RuntimeType): string => {
        switch (type.kind) {
            case 'instance':
            case 'enum':
            case 'object':
                return type.name;
            case 'array':
                return 'Array';
            case 'optional':
                return describe(type.type);
            case 'variant':
                return type.types.map(describe).join(' | ');
            default:
                return type.kind;
        }
    };

    const outOfBounds = (index: number, value: number, min?: number, max?: number): Error => {
        const bounds =
            min !== undefined && max !== undefined
                ? `Argument bounds: [${min}, ${max}]`
                : min !== undefined
                  ? `Argument min: ${min}`
                  : `Argument max: ${max}`;
        return makeError(
            COMMON,
            'ArgumentOutOfBoundsError',
            `Unsupported or out of bounds value passed to function argument [${index}]. Value: ${value}, ${bounds}`,
            { index, value, minValue: min, maxValue: max }
        );
    };

    /** Checks a call's arguments and fills in omitted defaults. */
    const check = (call: RuntimeCall, args: readonly unknown[]): unknown[] => {
        if (args.length < call.required) {
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
                const type = argument.type.kind === 'optional' ? argument.type.type : argument.type;
                if (type.kind === 'variant') throw new TypeError('Native variant type conversion failed.');
                throw new TypeError(
                    `Native type conversion failed. Function argument [${index}] expected type: ${describe(type)}`
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

    const method = (name: string, call: RuntimeCall): ((...args: unknown[]) => unknown) => {
        const holder = {
            [name](this: unknown, ...args: unknown[]): unknown {
                return invoke(call.id, this, check(call, args));
            }
        };
        const fn = holder[name];
        if (fn === undefined) throw new ReferenceError(`The method ${name} was not made`);
        return fn;
    };

    const accessors = (name: string, get: number, set: RuntimeCall | undefined): PropertyDescriptor => {
        const holder = {
            get [name](): unknown {
                return invoke(get, this, []);
            },
            set [name](value: unknown) {
                if (set !== undefined) invoke(set.id, this, check(set, [value]));
            }
        };
        const descriptor = Object.getOwnPropertyDescriptor(holder, name) ?? {};
        return { get: descriptor.get, ...(set === undefined ? {} : { set: descriptor.set }), configurable: true };
    };

    const installMember = (target: object, member: RuntimeMember): void => {
        if (member.kind === 'method') {
            define(target, member.name, {
                value: method(member.name, member.call),
                writable: true,
                configurable: true
            });
        } else if (member.kind === 'property') {
            define(target, member.name, accessors(member.name, member.get, member.set));
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
                if (construct === undefined) throw noConstructor(name);
                if (new.target === undefined)
                    throw new TypeError(`Class constructor ${name} cannot be invoked without 'new'`);
                invoke(construct.id, this, check(construct, args));
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
        for (const member of entry.members) installMember(member.static ? Class : Class.prototype, member);
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

    const create = (module: string, name: string): object => {
        const Class = classes.get(key(module, name));
        if (Class === undefined) throw new ReferenceError(`${module} has no bound class ${name}`);
        return Object.create(Class.prototype);
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
                return create(entry.module, entry.className);
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
