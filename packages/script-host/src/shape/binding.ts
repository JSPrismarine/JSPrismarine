import { NotImplementedError, ScriptApiError } from '../errors';
import type { ScriptEngine } from '../ScriptEngine';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import { SCRIPT_MODULE_HISTORIES } from '../generated/scriptModules';
import { engineRuntimeSource } from './engineRuntime';
import type { ModuleHistory, ShapeArgument, ShapeType } from './format';
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

/** How a {@link ScriptApiContext} binds. */
export interface ScriptApiContextOptions {
    /** The pack whose scripts the context serves, as BDS's log names it, such as `my pack - 1.0.0`. */
    readonly pack: string;
    readonly implementations: ScriptApiImplementations;
    readonly logger: ScriptApiLogger;
    /** The histories a module's dependencies resolve against. The generated ones when absent. */
    readonly histories?: Readonly<Record<string, ModuleHistory>>;
}

const handleOf = (value: ScriptValue, what: string): ScriptHandle => {
    if (value instanceof ScriptHandle) return value;
    throw new TypeError(`${what} is not an object`);
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
    private readonly entries: MemberEntry[] = [];
    private readonly bound = new Map<string, { readonly shape: ModuleShape; readonly namespace: ScriptHandle }>();
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
        const host = engine.hostFunction('scriptApi', (id, self, ...args) => this.dispatch(id, self, args));
        try {
            this.runtime = handleOf(engine.call(factory, undefined, host), 'The runtime');
        } finally {
            engine.free(host);
            engine.free(factory);
        }
        this.bindFunction = handleOf(engine.get(this.runtime, 'bind'), 'bind');
        this.createFunction = handleOf(engine.get(this.runtime, 'create'), 'create');
        this.raiseFunction = handleOf(engine.get(this.runtime, 'raise'), 'raise');
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
            throw new Error(
                `${this.options.pack} already has ${shape.module} ${existing.shape.version.version}, not ${shape.version.version}`
            );
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
     * @throws {ScriptError} When the module or the class is not bound.
     */
    public create(module: string, className: string): ScriptHandle {
        return handleOf(this.engine.call(this.createFunction, this.runtime, module, className), 'An instance');
    }

    /** Frees the context's handles. The engine keeps what scripts still refer to. */
    public destroy(): void {
        for (const { namespace } of this.bound.values()) this.engine.free(namespace);
        this.bound.clear();
        for (const handle of [this.bindFunction, this.createFunction, this.raiseFunction, this.runtime]) {
            this.engine.free(handle);
        }
    }

    private bindDependency(module: string, version: string): void {
        if (this.bound.has(module)) return;
        const history = this.histories[module];
        const major = parseVersion(version)?.major;
        const served = major === undefined ? undefined : history?.resolves[String(major)];
        if (history === undefined || served === undefined) {
            throw new Error(`${module} ${version}, a dependency of the bound modules, has no generated shape`);
        }
        this.bind(shapeAt(history, served));
    }

    private dispatch(id: ScriptValue, self: ScriptValue, args: ScriptValue[]): ScriptValue {
        const entry = typeof id === 'number' ? this.entries[id] : undefined;
        if (entry === undefined) throw new RangeError(`No Script API member has id ${String(id)}`);
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
        try {
            return implementation({ engine: this.engine, pack: this.options.pack, self, args });
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

    private entry(module: string, owner: string, member: string, access: MemberEntry['access']): number {
        this.entries.push({ module, owner, member, access });
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
                return { kind: 'function' };
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
        // A number type's own `valid_range`, when it differs from the default, bounds it like `details`.
        const range = typeof argument.type === 'object' && argument.type.kind === 'number' ? argument.type : undefined;
        const min = argument.min ?? range?.min;
        const max = argument.max ?? range?.max;
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
        args: readonly ShapeArgument[]
    ): RuntimeCall {
        const checks = args.map((argument) => this.argument(argument, shape));
        const required = checks.reduce((count, check, index) => (check.optional ? count : index + 1), 0);
        return { id: this.entry(shape.module, owner, member, access), arguments: checks, required };
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
                    construct = this.call(shape, name, memberName, 'construct', member.arguments);
                } else if (member.kind === 'method') {
                    const call = this.call(shape, name, memberName, 'call', member.arguments);
                    runtimeMembers.push({ kind: 'method', name: memberName, static: isStatic, call });
                } else if (member.kind === 'property') {
                    const get = this.entry(shape.module, name, memberName, 'get');
                    const value = { name: 'value', type: member.type, min: member.min, max: member.max };
                    const set = member.readOnly ? undefined : this.call(shape, name, memberName, 'set', [value]);
                    runtimeMembers.push({
                        kind: 'property',
                        name: memberName,
                        static: isStatic,
                        get,
                        ...(set === undefined ? {} : { set })
                    });
                } else {
                    runtimeMembers.push({ kind: 'constant', name: memberName, static: isStatic, value: member.value });
                }
            }
            const iterable = declaration.iterator !== undefined;
            if (iterable && !members.has('next')) {
                const call = this.call(shape, name, 'next', 'call', []);
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
                            ? this.call(shape, name, 'constructor', 'construct', constructor.arguments)
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
                        call: this.call(shape, '', name, 'call', declaration.arguments)
                    });
                    break;
                case 'object': {
                    const type =
                        typeof declaration.type === 'object' && declaration.type.kind === 'optional'
                            ? declaration.type.type
                            : declaration.type;
                    if (typeof type !== 'string')
                        throw new TypeError(`${shape.module}'s ${name} is not of a class in it`);
                    exports.push({ kind: 'object', name, module: shape.module, className: type });
                    break;
                }
            }
        }
        return exports;
    }
}
