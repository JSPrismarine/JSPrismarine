/**
 * The custom commands, command enums, custom components and custom dimensions the packs of one
 * runtime register, and the rules BDS checks a registration against.
 *
 * A pack registers them while `system.beforeEvents.startup` runs, or a version 1 pack while
 * `world.beforeEvents.worldInitialize` does, and at no other time. The messages are the ones the
 * `custom-commands`, `custom-components` and `custom-dimensions` scenarios recorded on the pinned
 * BDS.
 */
import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

import { engineFunctionSource } from '../engineSource';
import { ScriptApiError } from '../errors';
import type { ScriptEngine } from '../ScriptEngine';
import type { ModuleShape } from '../shape/history';
import type { ScriptValue } from '../values';
import { ScriptHandle } from '../values';
import { SERVER } from './serverObjects';
import type { ScriptCommandEnum, ScriptCustomCommand } from './world';

/** Whether a custom component is a block's or an item's. */
export type ComponentKind = 'block' | 'item';

/** The interface a script's component object fills, for each kind. */
const COMPONENT_INTERFACES: Readonly<Record<ComponentKind, string>> = {
    block: 'BlockCustomComponent',
    item: 'ItemCustomComponent'
};

/** A command a pack registered, and the pack whose callback runs it. */
export interface RegisteredCommand<Owner> {
    readonly owner: Owner;
    readonly command: ScriptCustomCommand;
    readonly callback: ScriptHandle;
}

/** A component a pack registered: its object, and the function of each hook it has. */
export interface RegisteredComponent<Owner> {
    readonly owner: Owner;
    readonly name: string;
    /** The object the script passed, which each hook is called on. */
    readonly component: ScriptHandle;
    readonly hooks: ReadonlyMap<string, ScriptHandle>;
    /**
     * The event class each hook's first argument is, from the pack's own `@minecraft/server`
     * version, such as `BlockComponentOnPlaceEvent`.
     */
    readonly eventClasses: ReadonlyMap<string, string>;
}

/** What a pack's members register through. */
export interface PackCustomContent {
    /** Whether the pack may register now: `startup` is running, or `worldInitialize` for a version 1 pack. */
    registering(): boolean;
    /** @throws {ScriptApiError} When BDS refuses the enum. */
    registerEnum(name: string, values: readonly string[]): void;
    /**
     * @param callback - The script's function, which the registry duplicates.
     * @throws {ScriptApiError} When BDS refuses the command.
     */
    registerCommand(command: ScriptCustomCommand, callback: ScriptHandle): void;
    /**
     * @param component - The script's object, whose hooks the registry reads now, as BDS does.
     * @throws {ScriptApiError} When BDS refuses the name.
     * @throws {TypeError} When a hook is not a function.
     */
    registerComponent(kind: ComponentKind, name: string, component: ScriptHandle): void;
    /** @throws {ScriptApiError} When BDS refuses the dimension. */
    registerDimension(typeId: string): void;
}

/**
 * What the world answers a custom dimension registration: it has the dimension now, or it is one
 * the world did not have when it opened and a reload cannot add.
 */
export type DimensionRegistration = 'registered' | 'new-after-reload';

/** Adds a custom dimension to the world; see {@link DimensionRegistration}. */
export type RegisterDimension = (typeId: string) => DimensionRegistration;

/** The characters a custom dimension's name may hold, on either side of its namespace's colon. */
const DIMENSION_NAME = /^[A-Za-z0-9_.\-/]+:[A-Za-z0-9_.\-/]+$/;

const dimensionError = (errorClass: string, message: string): ScriptApiError =>
    new ScriptApiError(SERVER, errorClass, message);

/** Why BDS refuses a namespaced name: a missing namespace, or the `minecraft` one. */
const namespaceError = (name: string): ScriptApiError | undefined => {
    const colon = name.indexOf(':');
    if (colon <= 0) {
        return new ScriptApiError(
            SERVER,
            'NamespaceNameError',
            `There was an error with name '${name}': string must be prefixed with a namespace (eg. namespace:value).`,
            { reason: 'NoNamespace' }
        );
    }
    const namespace = name.slice(0, colon);
    if (namespace === 'minecraft') {
        return new ScriptApiError(
            SERVER,
            'NamespaceNameError',
            `There was an error with name '${name}': string has invalid namespace (${namespace}).`,
            { reason: 'DisallowedNamespace' }
        );
    }
    return undefined;
};

const commandError = (reason: string, message: string): ScriptApiError =>
    new ScriptApiError(SERVER, 'CustomCommandError', message, { reason });

/**
 * Reads the hooks of a component object inside the engine: the function each named hook holds,
 * or the name of the first that holds something else. It runs as the script's own code would, so
 * a getter on the object runs under the watchdog. It must not refer to anything outside its body.
 */
function readHooks(component: unknown, names: readonly string[]): string | unknown[] {
    // biome-ignore lint/suspicious/noRedundantUseStrict: the engine runs this source as a script, which is sloppy unless it says otherwise.
    'use strict';
    // Any object a script passed; the binding checked only that it is one.
    const object = component as Readonly<Record<string, unknown>>;
    const found: unknown[] = [];
    for (const name of names) {
        const value = object[name];
        if (value !== undefined && typeof value !== 'function') return name;
        found.push(value === undefined ? null : value);
    }
    return found;
}

/** The custom content of one runtime. A reload makes a new one. */
export class CustomContent<Owner> {
    private readonly enums = new Map<string, readonly string[]>();
    private readonly commands = new Map<string, RegisteredCommand<Owner>>();
    private readonly components: Readonly<Record<ComponentKind, Map<string, RegisteredComponent<Owner>>>> = {
        block: new Map(),
        item: new Map()
    };
    /** The custom dimensions this run registered. */
    private readonly dimensions = new Set<string>();

    /**
     * @param engine - The engine the scripts run in, which holds every handle the registry keeps.
     * @param registerDimension - Adds a custom dimension to the world. Left out, the world takes
     *   every registration and adds nothing.
     */
    public constructor(
        private readonly engine: ScriptEngine,
        private readonly registerDimension: RegisterDimension = () => 'registered'
    ) {}

    /**
     * The registration members of one pack.
     * @param owner - The pack, read when it registers something, so a pack can be made after its members.
     * @param shape - The pack's `@minecraft/server`, which names the hooks of a component.
     * @param registering - Whether the pack may register now.
     */
    public forPack(owner: () => Owner, shape: ModuleShape | undefined, registering: () => boolean): PackCustomContent {
        return {
            registering,
            registerEnum: (name, values) => {
                if (!registering()) {
                    throw commandError(
                        'RegistryReadOnly',
                        'Custom Command registration failed outside of the ModuleStartup event.'
                    );
                }
                const refused = namespaceError(name);
                if (refused !== undefined) throw refused;
                if (this.enums.has(name)) {
                    throw commandError('AlreadyRegistered', `Custom Command Enum '${name}' was already registered.`);
                }
                this.enums.set(name, [...values]);
            },
            registerCommand: (command, callback) => {
                if (!registering()) {
                    throw commandError(
                        'RegistryReadOnly',
                        'Custom Command registration failed outside of the ModuleStartup event.'
                    );
                }
                const refused = namespaceError(command.name);
                if (refused !== undefined) throw refused;
                if (this.commands.has(command.name)) {
                    throw commandError('AlreadyRegistered', `Custom Command '${command.name}' was already registered.`);
                }
                const missing = [...command.mandatoryParameters, ...command.optionalParameters]
                    .filter((parameter) => parameter.type === 'Enum')
                    .map((parameter) => parameter.enumName ?? parameter.name)
                    .filter((name) => !this.enums.has(name));
                if (missing.length > 0) {
                    throw commandError(
                        'EnumDependencyMissing',
                        `Custom Command depends on one or more unknown enums [${missing.join(', ')}].`
                    );
                }
                this.commands.set(command.name, { owner: owner(), command, callback: this.engine.duplicate(callback) });
            },
            registerComponent: (kind, name, component) => {
                const declared = shape?.declarations.get(COMPONENT_INTERFACES[kind])?.members ?? new Map();
                const hookNames = [...declared.keys()];
                const hooks = this.readHooks(component, hookNames, (hook) => {
                    const member = declared.get(hook);
                    return member?.kind === 'property' ? closureText(member.type) : 'Closure';
                });
                if (!registering()) {
                    throw new ScriptApiError(
                        SERVER,
                        'CustomComponentInvalidRegistryError',
                        'Cannot register custom component outside of the ModuleStartup event.'
                    );
                }
                const refused = namespaceError(name);
                if (refused !== undefined) {
                    for (const handle of hooks.values()) this.engine.free(handle);
                    throw refused;
                }
                const registered = this.components[kind];
                if (registered.has(name)) {
                    for (const handle of hooks.values()) this.engine.free(handle);
                    const errorClass =
                        kind === 'block'
                            ? 'BlockCustomComponentAlreadyRegisteredError'
                            : 'ItemCustomComponentAlreadyRegisteredError';
                    const what = kind === 'block' ? 'Block' : 'Item';
                    throw new ScriptApiError(
                        SERVER,
                        errorClass,
                        `${what} custom component '${name}' was already registered.`
                    );
                }
                const eventClasses = new Map<string, string>();
                for (const hook of hooks.keys()) {
                    const member = declared.get(hook);
                    const eventClass = member?.kind === 'property' ? firstArgument(member.type) : undefined;
                    if (eventClass !== undefined) eventClasses.set(hook, eventClass);
                }
                registered.set(name, {
                    owner: owner(),
                    name,
                    component: this.engine.duplicate(component),
                    hooks,
                    eventClasses
                });
            },
            registerDimension: (typeId) => {
                if (!registering()) {
                    throw dimensionError(
                        'CustomDimensionInvalidRegistryError',
                        `Cannot register custom dimension '${typeId}' outside of StartupEvent.`
                    );
                }
                const refused = namespaceError(typeId);
                if (refused !== undefined) throw refused;
                if (!DIMENSION_NAME.test(typeId)) {
                    throw dimensionError(
                        'CustomDimensionNameError',
                        `Custom dimension '${typeId}' has invalid characters.`
                    );
                }
                if (this.dimensions.has(typeId)) {
                    throw dimensionError(
                        'CustomDimensionAlreadyRegisteredError',
                        `Custom dimension '${typeId}' was already registered.`
                    );
                }
                if (this.registerDimension(typeId) === 'new-after-reload') {
                    throw dimensionError(
                        'CustomDimensionReloadNewDimensionError',
                        `Custom dimension '${typeId}' is new and could not be registered on reload. Please exit and rejoin your world.`
                    );
                }
                this.dimensions.add(typeId);
            }
        };
    }

    /** The commands and enums registered so far, in the order they were registered. */
    public commandList(): {
        readonly commands: readonly ScriptCustomCommand[];
        readonly enums: readonly ScriptCommandEnum[];
    } {
        return {
            commands: [...this.commands.values()].map((entry) => entry.command),
            enums: [...this.enums].map(([name, values]) => ({ name, values }))
        };
    }

    /** A registered command, by its full name. */
    public command(name: string): RegisteredCommand<Owner> | undefined {
        return this.commands.get(name);
    }

    /** A registered component, by its kind and name. */
    public component(kind: ComponentKind, name: string): RegisteredComponent<Owner> | undefined {
        return this.components[kind].get(name);
    }

    /** Whether any component is registered, so a world need not send hooks at all. */
    public hasComponents(): boolean {
        return this.components.block.size > 0 || this.components.item.size > 0;
    }

    /** Frees every handle the registry holds. */
    public free(): void {
        for (const entry of this.commands.values()) this.engine.free(entry.callback);
        for (const registered of Object.values(this.components)) {
            for (const entry of registered.values()) {
                this.engine.free(entry.component);
                for (const handle of entry.hooks.values()) this.engine.free(handle);
            }
        }
        this.commands.clear();
        this.enums.clear();
        this.components.block.clear();
        this.components.item.clear();
    }

    /**
     * Reads a component's hooks in the engine.
     * @param expected - The type BDS names in its error for a hook that is not a function.
     * @throws {TypeError} BDS's conversion error, for a hook that is not a function.
     */
    private readHooks(
        component: ScriptHandle,
        names: readonly string[],
        expected: (hook: string) => string
    ): Map<string, ScriptHandle> {
        const engine = this.engine;
        const read = engine.evaluate(engineFunctionSource(readHooks.toString()), '<jsp custom component>');
        if (!(read instanceof ScriptHandle)) throw new ScriptHostErrors.NotAFunction({ what: 'The hook reader' });
        const list = toScriptArray(engine, names);
        let found: ScriptValue;
        try {
            found = engine.call(read, undefined, component, list);
        } finally {
            engine.free(list);
            engine.free(read);
        }
        if (typeof found === 'string') {
            throw new ScriptHostErrors.InterfacePropertyConversionFailed({
                property: found,
                expected: expected(found)
            });
        }
        const hooks = new Map<string, ScriptHandle>();
        if (!(found instanceof ScriptHandle)) return hooks;
        try {
            names.forEach((name, index) => {
                const value = engine.get(found, String(index));
                if (value instanceof ScriptHandle) hooks.set(name, value);
            });
        } finally {
            engine.free(found);
        }
        return hooks;
    }
}

/** A list of strings as a script array, which the caller frees. */
const toScriptArray = (engine: ScriptEngine, values: readonly string[]): ScriptHandle => {
    const parsed = engine.evaluate(`(${JSON.stringify(values)})`);
    if (!(parsed instanceof ScriptHandle)) throw new ScriptHostErrors.LiteralEvaluatedToPrimitive({ kind: 'array' });
    return parsed;
};

/** The class a closure's first argument is, such as the event class of a component hook. */
const firstArgument = (type: unknown): string | undefined => {
    const closure = closureOf(type);
    const [first] = closure?.arguments ?? [];
    return typeof first === 'string' ? first : undefined;
};

/** How BDS writes a hook's closure type in a conversion error. */
const closureText = (type: unknown): string => {
    const closure = closureOf(type);
    const names = (closure?.arguments ?? []).map((argument) => (typeof argument === 'string' ? argument : 'any'));
    return `Closure: (${names.join(', ')}) => void | undefined`;
};

/** The closure an optional hook property holds. */
const closureOf = (type: unknown): { readonly arguments: readonly unknown[] } | undefined => {
    if (typeof type !== 'object' || type === null) return undefined;
    if ('kind' in type && type.kind === 'optional' && 'type' in type) return closureOf(type.type);
    if ('kind' in type && type.kind === 'closure' && 'arguments' in type && Array.isArray(type.arguments)) {
        return { arguments: type.arguments };
    }
    return undefined;
};
