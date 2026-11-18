import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { NotImplementedError, ScriptApiError } from '../errors';
import type { ScriptEngine } from '../ScriptEngine';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import { SCRIPT_MODULE_HISTORIES } from '../generated/scriptModules';
import { engineRuntimeSource } from './engineRuntime';
import type { ModuleHistory, NumberType, Privilege, ShapeArgument, ShapeType } from './format';
import { isNumberType } from './format';
import type { ModuleShape } from './history';
import { shapeAt } from './history';
import type { Implementation, MemberFunction, ScriptApiImplementations } from './implementations';
import type { MemberEntry, RuntimeArgument, RuntimeCall, RuntimeExport, RuntimeMember, RuntimeType } from './plan';
import { parseVersion } from './version';

/** Where the binding reports a member a pack used that has no implementation. */
export interface ScriptApiLogger {
    warn(message: string): void;
}

/** What the host gave an instance it made, which every call of the instance's members receives. */
export interface HostInstance {
    /** The instance's {@link ScriptCall.tag}. */
    readonly tag: number;
    /** The instance's {@link ScriptCall.state}, or an empty string when it has none. */
    readonly state: string;
}

/** How a {@link ScriptApiContext} binds. */
export interface ScriptApiContextOptions {
    /** The pack whose scripts the context serves, as BDS's log names it, such as `my pack - 1.0.0`. */
    readonly pack: string;
    readonly implementations: ScriptApiImplementations;
    readonly logger: ScriptApiLogger;
    /** The histories a module's dependencies resolve against. The generated ones when absent. */
    readonly histories?: Readonly<Record<string, ModuleHistory>>;
    /**
     * The privilege the script running now has. A member whose metadata does not list it throws
     * BDS's error before its implementation runs. `default` when absent.
     */
    readonly privilege?: () => Privilege;
}

/** The bounds of each integer type, which BDS checks an argument against when its metadata sets none. */
const INTEGER_BOUNDS: Partial<Record<NumberType, readonly [number, number]>> = {
    int8: [-128, 127],
    uint8: [0, 255],
    int16: [-32768, 32767],
    uint16: [0, 65535],
    int32: [-2147483648, 2147483647],
    uint32: [0, 4294967295]
};

/** How BDS writes a privilege in its error. */
const PRIVILEGE_NAMES: Readonly<Record<Privilege, string>> = {
    default: 'default execution',
    early_execution: 'early execution',
    restricted_execution: 'restricted execution'
};

/**
 * How BDS names a member in a privilege error, such as `Native function [World::getDimension]`, or
 * `Native constructor for [HttpRequest]` for a constructor.
 */
const nativeName = (entry: MemberEntry): string => {
    const name = entry.owner === '' ? entry.member : `${entry.owner}::${entry.member}`;
    if (entry.access === 'get') return `Native property getter [${name}]`;
    if (entry.access === 'set') return `Native property setter [${name}]`;
    if (entry.access === 'construct') return `Native constructor for [${entry.owner}]`;
    return `Native function [${name}]`;
};

/** The type a closure's errors print, such as `() => void`. */
const closureSignature = (arguments_: readonly ShapeType[], returns: ShapeType): string => {
    const named = (type: ShapeType): string => {
        if (typeof type === 'string') return type === 'undefined' ? 'void' : type;
        if (type.kind === 'external') return type.name;
        return 'unknown';
    };
    return `(${arguments_.map((type, index) => `arg${index}: ${named(type)}`).join(', ')}) => ${named(returns)}`;
};

const handleOf = (value: ScriptValue, what: string): ScriptHandle => {
    if (value instanceof ScriptHandle) return value;
    throw new ScriptHostErrors.NotAnObject({ what });
};

/** The function an implementation runs for one access, or undefined when it has none. */
const pick = (
    implementation: Implementation | undefined,
    access: MemberEntry['access']
): MemberFunction | undefined => {
    if (implementation === undefined) return undefined;
    if (typeof implementation === 'function')
        return access === 'call' || access === 'construct' ? implementation : undefined;
    if (access === 'get') return implementation.get;
    if (access === 'set' && 'set' in implementation) {
        const { set } = implementation;
        return set === undefined
            ? undefined
            : (call) => {
                  set(call);
                  return undefined;
              };
    }
    return undefined;
};

/**
 * One pack's view of the Script API in an engine. It installs each module the pack resolves into
 * a namespace object, with every class, enum, constant and error class of the served version, and
 * dispatches every member to its registered implementation. A member with none throws
 * `NotImplementedError`, and the context logs it the first time the pack uses it.
 */
export class ScriptApiContext {
    private readonly engine: ScriptEngine;
    private readonly options: ScriptApiContextOptions;
    private readonly histories: Readonly<Record<string, ModuleHistory>>;
    private readonly runtime: ScriptHandle;
    private readonly bindFunction: ScriptHandle;
    private readonly createFunction: ScriptHandle;
    private readonly raiseFunction: ScriptHandle;
    private readonly errorFunction: ScriptHandle;
    private readonly tagFunction: ScriptHandle;
    private readonly stateFunction: ScriptHandle;
    private readonly setStateFunction: ScriptHandle;
    private readonly stateOfFunction: ScriptHandle;
    private readonly stringifyFunction: ScriptHandle;
    private readonly entries: MemberEntry[] = [];
    private readonly bound = new Map<string, { readonly shape: ModuleShape; readonly namespace: ScriptHandle }>();
    private destroyed = false;
    private readonly reported = new Set<number>();

    /**
     * Evaluates the binding's runtime in the engine and gives it this context's host function.
     * @throws {ScriptError} When the engine cannot run the runtime.
     */
    public constructor(engine: ScriptEngine, options: ScriptApiContextOptions) {
        this.engine = engine;
        this.options = options;
        this.histories = options.histories ?? SCRIPT_MODULE_HISTORIES;
        const factory = handleOf(engine.evaluate(engineRuntimeSource(), '<jsp script api>'), 'The runtime');
        const host = engine.hostFunction('scriptApi', (id, self, tag, state, ...args) =>
            this.dispatch(id, self, tag, state, args)
        );
        try {
            this.runtime = handleOf(engine.call(factory, undefined, host), 'The runtime');
        } finally {
            engine.free(host);
            engine.free(factory);
        }
        this.bindFunction = handleOf(engine.get(this.runtime, 'bind'), 'bind');
        this.createFunction = handleOf(engine.get(this.runtime, 'create'), 'create');
        this.raiseFunction = handleOf(engine.get(this.runtime, 'raise'), 'raise');
        this.errorFunction = handleOf(engine.get(this.runtime, 'error'), 'error');
        this.tagFunction = handleOf(engine.get(this.runtime, 'tag'), 'tag');
        this.stateFunction = handleOf(engine.get(this.runtime, 'state'), 'state');
        this.setStateFunction = handleOf(engine.get(this.runtime, 'setState'), 'setState');
        this.stateOfFunction = handleOf(engine.get(this.runtime, 'stateOf'), 'stateOf');
        this.stringifyFunction = handleOf(engine.get(this.runtime, 'stringify'), 'stringify');
    }

    /**
     * Installs a served version of a module, after the modules it depends on, and returns its
     * namespace. The context owns the handle and frees it in {@link destroy}.
     * @throws {Error} When the pack already has another version of the module.
     */
    public bind(shape: ModuleShape): ScriptHandle {
        const existing = this.bound.get(shape.module);
        if (existing !== undefined) {
            if (existing.shape.version.version === shape.version.version) return existing.namespace;
            throw new ScriptHostErrors.ModuleVersionConflict({
                pack: this.options.pack,
                module: shape.module,
                bound: existing.shape.version.version,
                requested: shape.version.version
            });
        }
        for (const [module, version] of Object.entries(shape.version.dependencies))
            this.bindDependency(module, version);
        const plan = { module: shape.module, exports: this.exportsOf(shape) };
        const namespace = handleOf(
            this.engine.call(this.bindFunction, this.runtime, JSON.stringify(plan)),
            'A namespace'
        );
        this.bound.set(shape.module, { shape, namespace });
        return namespace;
    }

    /** The namespace of a bound module. */
    public namespace(module: string): ScriptHandle | undefined {
        return this.bound.get(module)?.namespace;
    }

    /**
     * Makes an instance of a bound class without running its constructor, for an implementation to
     * return. The caller frees the handle.
     * @param tag - What the instance stands for, which every call of its members receives as
     *   {@link ScriptCall.tag}, such as an index into the host's own table.
     * @param state - What the instance holds, which every call of its members receives as
     *   {@link ScriptCall.state}, such as an entity's id. It lives as long as the instance does.
     * @throws {ScriptError} When the module or the class is not bound.
     */
    public create(module: string, className: string, tag = 0, state = ''): ScriptHandle {
        return handleOf(
            this.engine.call(this.createFunction, this.runtime, module, className, tag, state),
            'An instance'
        );
    }

    /**
     * The tag and the state the host gave an instance when it made it, such as the entity a
     * `Player` passed to a member carries.
     * @returns Undefined for a value the host did not make, which a script made with
     *   `Object.create` or a constructor the host did not run.
     */
    public identify(value: ScriptValue): HostInstance | undefined {
        if (!(value instanceof ScriptHandle)) return undefined;
        const tag = this.engine.call(this.tagFunction, this.runtime, value);
        if (typeof tag !== 'number' || tag < 0) return undefined;
        const state = this.engine.call(this.stateFunction, this.runtime, value);
        return { tag, state: typeof state === 'string' ? state : '' };
    }

    /**
     * Makes an instance of one of the API's error classes without throwing it, such as the error
     * a promise rejects with. The caller frees the handle.
     * @throws {ScriptError} When the engine cannot make it.
     */
    public makeError(error: ScriptApiError): ScriptHandle {
        return handleOf(
            this.engine.call(
                this.errorFunction,
                this.runtime,
                error.errorModule,
                error.errorClass,
                error.message,
                JSON.stringify(error.fields)
            ),
            'An error'
        );
    }

    /** Frees the context's handles. The engine keeps what scripts still refer to. */
    public destroy(): void {
        // A second destroy would free slots the engine may have handed to live values since.
        if (this.destroyed) return;
        this.destroyed = true;
        for (const { namespace } of this.bound.values()) this.engine.free(namespace);
        this.bound.clear();
        for (const handle of [
            this.bindFunction,
            this.createFunction,
            this.raiseFunction,
            this.errorFunction,
            this.tagFunction,
            this.stateFunction,
            this.setStateFunction,
            this.stateOfFunction,
            this.stringifyFunction,
            this.runtime
        ]) {
            this.engine.free(handle);
        }
    }

    private bindDependency(module: string, version: string): void {
        if (this.bound.has(module)) return;
        const history = this.histories[module];
        const parsed = parseVersion(version);
        // A beta dependency, such as `@minecraft/server-net`'s on `@minecraft/server-admin`
        // 1.0.0-beta, is served as the one beta the history has, as a pack's own is.
        const served =
            parsed === undefined || history === undefined
                ? undefined
                : parsed.tag === undefined
                  ? history.resolves[String(parsed.major)]
                  : history.versions.find((entry) => entry.version === version && entry.stability === 'beta')?.version;
        if (history === undefined || served === undefined) {
            throw new ScriptHostErrors.DependencyHasNoShape({ module, version });
        }
        this.bind(shapeAt(history, served));
    }

    private dispatch(
        id: ScriptValue,
        self: ScriptValue,
        tagValue: ScriptValue,
        stateValue: ScriptValue,
        args: ScriptValue[]
    ): ScriptValue {
        const entry = typeof id === 'number' ? this.entries[id] : undefined;
        if (entry === undefined) throw new ScriptHostErrors.UnknownApiMember({ id });
        const tag = typeof tagValue === 'number' ? tagValue : 0;
        const privilege = this.options.privilege?.() ?? 'default';
        if (privilege !== 'default' && !entry.privilege.includes(privilege)) {
            throw new ScriptHostErrors.MemberNotPrivileged({
                member: nativeName(entry),
                privilege: PRIVILEGE_NAMES[privilege]
            });
        }
        const implementation = pick(
            this.options.implementations.find(entry.module, entry.owner, entry.member),
            entry.access
        );
        if (implementation === undefined) {
            const error = new NotImplementedError(entry, entry.access === 'set' ? 'set' : undefined);
            if (typeof id === 'number' && !this.reported.has(id)) {
                this.reported.add(id);
                this.options.logger.warn(`[${this.options.pack}] ${error.message}`);
            }
            throw error;
        }
        const state = typeof stateValue === 'string' ? stateValue : '';
        const setState = (next: string): void => {
            if (self instanceof ScriptHandle) this.engine.call(this.setStateFunction, this.runtime, self, next);
        };
        const setStateOf = (value: ScriptValue, next: string): void => {
            if (value instanceof ScriptHandle && this.identify(value) !== undefined) {
                this.engine.call(this.setStateFunction, this.runtime, value, next);
            }
        };
        const stateOf = (value: ScriptValue): string => {
            if (!(value instanceof ScriptHandle)) return '';
            const found = this.engine.call(this.stateOfFunction, this.runtime, value);
            return typeof found === 'string' ? found : '';
        };
        const stringify = (value: ScriptValue): string | undefined => {
            const json = this.engine.call(this.stringifyFunction, this.runtime, value);
            return typeof json === 'string' ? json : undefined;
        };
        try {
            return implementation({
                engine: this.engine,
                pack: this.options.pack,
                self,
                tag,
                state,
                setState,
                stateOf,
                setStateOf,
                stringify,
                args
            });
        } catch (error) {
            if (!(error instanceof ScriptApiError)) throw error;
            this.engine.call(
                this.raiseFunction,
                this.runtime,
                error.errorModule,
                error.errorClass,
                error.message,
                JSON.stringify(error.fields)
            );
            return undefined;
        }
    }

    private entry(
        module: string,
        owner: string,
        member: string,
        access: MemberEntry['access'],
        privilege: readonly Privilege[] | undefined
    ): number {
        // A getter or setter the metadata gives no privileges allows only the default one.
        this.entries.push({ module, owner, member, access, privilege: privilege ?? [] });
        return this.entries.length - 1;
    }

    /** The check for a type, with each name looked up in the module that declares it. */
    private runtimeType(type: ShapeType, shape: ModuleShape): RuntimeType {
        if (typeof type === 'string') {
            if (isNumberType(type)) return { kind: 'number' };
            if (type === 'boolean' || type === 'string') return { kind: type };
            if (type === 'undefined' || type === 'void') return { kind: 'undefined' };
            if (type === 'any' || type === 'unknown' || type === 'error') return { kind: 'any' };
            return this.named(shape, shape.module, type);
        }
        switch (type.kind) {
            case 'external': {
                const declaring = this.bound.get(type.module)?.shape;
                return declaring === undefined
                    ? { kind: 'object', name: type.name }
                    : this.named(declaring, type.module, type.name);
            }
            case 'number':
                return { kind: 'number' };
            case 'optional':
                return { kind: 'optional', type: this.runtimeType(type.type, shape) };
            case 'variant':
                return { kind: 'variant', types: type.types.map((each) => this.runtimeType(each, shape)) };
            case 'array':
                return { kind: 'array', element: this.runtimeType(type.element, shape) };
            case 'map':
                return { kind: 'object', name: 'Record' };
            case 'closure':
                return { kind: 'function', signature: closureSignature(type.arguments, type.returns) };
            case 'promise':
            case 'generator':
            case 'script':
                return { kind: 'any' };
        }
    }

    private named(shape: ModuleShape, module: string, name: string): RuntimeType {
        const kind = shape.declarations.get(name)?.declaration.kind;
        if (kind === 'class' || kind === 'error') return { kind: 'instance', module, name };
        if (kind === 'enum') return { kind: 'enum', module, name };
        return { kind: 'object', name };
    }

    private argument(argument: ShapeArgument, shape: ModuleShape): RuntimeArgument {
        const type = this.runtimeType(argument.type, shape);
        // A number type's own `valid_range`, when it differs from the default, bounds it like
        // `details`; an integer type without either is bounded by the type itself.
        const declared =
            typeof argument.type === 'object' && argument.type.kind === 'optional' ? argument.type.type : argument.type;
        const range = typeof declared === 'object' && declared.kind === 'number' ? declared : undefined;
        const intrinsic = typeof declared === 'string' && isNumberType(declared) ? INTEGER_BOUNDS[declared] : undefined;
        const declaredBounds = argument.min !== undefined || argument.max !== undefined || range !== undefined;
        const min = declaredBounds ? (argument.min ?? range?.min) : intrinsic?.[0];
        const max = declaredBounds ? (argument.max ?? range?.max) : intrinsic?.[1];
        return {
            type,
            optional: 'default' in argument || type.kind === 'optional',
            ...(argument.default === undefined || argument.default === null ? {} : { default: argument.default }),
            ...(min === undefined ? {} : { min }),
            ...(max === undefined ? {} : { max }),
            ...(argument.maxLength === undefined ? {} : { maxLength: argument.maxLength })
        };
    }

    private call(
        shape: ModuleShape,
        owner: string,
        member: string,
        access: MemberEntry['access'],
        args: readonly ShapeArgument[],
        privilege: readonly Privilege[] | undefined,
        returns?: ShapeType
    ): RuntimeCall {
        const converted = this.options.implementations.converts(shape.module, owner, member);
        const checks = args.map((argument): RuntimeArgument => {
            const checked = this.argument(argument, shape);
            return converted.includes(argument.name) ? { type: { kind: 'host' }, optional: checked.optional } : checked;
        });
        const required = checks.reduce((count, check, index) => (check.optional ? count : index + 1), 0);
        return {
            id: this.entry(shape.module, owner, member, access, privilege),
            arguments: checks,
            required,
            ...(returns !== undefined && this.isPlainResult(returns, shape) ? { json: true } : {})
        };
    }

    /** Whether a member returns plain data, which its implementation passes as JSON. */
    private isPlainResult(type: ShapeType, shape: ModuleShape): boolean {
        const plain = (checked: RuntimeType): boolean => {
            switch (checked.kind) {
                case 'boolean':
                case 'string':
                case 'number':
                case 'enum':
                case 'object':
                    return true;
                case 'array':
                case 'optional':
                    return plain(checked.kind === 'array' ? checked.element : checked.type);
                case 'variant':
                    return checked.types.every(plain);
                default:
                    return false;
            }
        };
        const result = this.runtimeType(type, shape);
        const inner = result.kind === 'optional' ? result.type : result;
        return (inner.kind === 'object' || inner.kind === 'array') && plain(inner);
    }

    private exportsOf(shape: ModuleShape): RuntimeExport[] {
        const exports: RuntimeExport[] = [];
        const placed = new Set<string>();
        const placeClass = (name: string): void => {
            if (placed.has(name)) return;
            const entry = shape.declarations.get(name);
            if (entry?.declaration.kind !== 'class') return;
            placed.add(name);
            const { declaration, members } = entry;
            const base = declaration.base;
            let baseReference: { module: string; name: string } | undefined;
            if (typeof base === 'string') {
                placeClass(base);
                baseReference = { module: shape.module, name: base };
            } else if (base !== undefined) {
                baseReference = { module: base.module, name: base.name };
            }
            const runtimeMembers: RuntimeMember[] = [];
            let construct: RuntimeCall | undefined;
            for (const [memberName, member] of members) {
                const isStatic = member.kind !== 'constructor' && member.static === true;
                if (member.kind === 'constructor') {
                    construct = this.call(shape, name, memberName, 'construct', member.arguments, member.privilege);
                } else if (member.kind === 'method') {
                    const call = this.call(
                        shape,
                        name,
                        memberName,
                        'call',
                        member.arguments,
                        member.privilege,
                        member.returns
                    );
                    runtimeMembers.push({ kind: 'method', name: memberName, static: isStatic, call });
                } else if (member.kind === 'property') {
                    const get = this.entry(shape.module, name, memberName, 'get', member.get);
                    const value = { name: 'value', type: member.type, min: member.min, max: member.max };
                    const set = member.readOnly
                        ? undefined
                        : this.call(shape, name, memberName, 'set', [value], member.set);
                    runtimeMembers.push({
                        kind: 'property',
                        name: memberName,
                        static: isStatic,
                        get,
                        ...(this.isPlainResult(member.type, shape) ? { json: true } : {}),
                        ...(set === undefined ? {} : { set })
                    });
                } else {
                    runtimeMembers.push({ kind: 'constant', name: memberName, static: isStatic, value: member.value });
                }
            }
            const iterable = declaration.iterator !== undefined;
            if (iterable && !members.has('next')) {
                // The metadata gives an iterator's next no privileges; it is a read, so every one may call it.
                const call = this.call(shape, name, 'next', 'call', [], ['early_execution', 'restricted_execution']);
                runtimeMembers.push({ kind: 'method', name: 'next', static: false, call });
            }
            exports.push({
                kind: 'class',
                name,
                ...(baseReference === undefined ? {} : { base: baseReference }),
                ...(construct === undefined ? {} : { construct }),
                iterable,
                members: runtimeMembers
            });
        };

        for (const name of shape.declarations.keys()) placeClass(name);
        for (const { name, declaration, members } of shape.declarations.values()) {
            switch (declaration.kind) {
                case 'error': {
                    const constructor = members.get('constructor');
                    const construct =
                        constructor?.kind === 'constructor'
                            ? this.call(
                                  shape,
                                  name,
                                  'constructor',
                                  'construct',
                                  constructor.arguments,
                                  constructor.privilege
                              )
                            : undefined;
                    const properties = [...members]
                        .filter(([, member]) => member.kind === 'property')
                        .map(([member]) => member);
                    exports.push({
                        kind: 'error',
                        name,
                        ...(construct === undefined ? {} : { construct }),
                        properties
                    });
                    break;
                }
                case 'enum': {
                    const values: [string, string | number | boolean][] = [];
                    for (const [member, value] of members)
                        if (value.kind === 'constant') values.push([member, value.value]);
                    exports.push({ kind: 'enum', name, values });
                    break;
                }
                case 'constant':
                    exports.push({ kind: 'constant', name, value: declaration.value });
                    break;
                case 'function':
                    exports.push({
                        kind: 'function',
                        name,
                        call: this.call(
                            shape,
                            '',
                            name,
                            'call',
                            declaration.arguments,
                            declaration.privilege,
                            declaration.returns
                        )
                    });
                    break;
                case 'object': {
                    const type =
                        typeof declaration.type === 'object' && declaration.type.kind === 'optional'
                            ? declaration.type.type
                            : declaration.type;
                    if (typeof type !== 'string')
                        throw new ScriptHostErrors.ExportNotOfModuleClass({ module: shape.module, name });
                    exports.push({ kind: 'object', name, module: shape.module, className: type });
                    break;
                }
            }
        }
        return exports;
    }
}
