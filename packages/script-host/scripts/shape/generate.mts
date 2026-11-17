/**
 * Turns Mojang's `metadata/script_modules/@minecraft` files into the module histories
 * `src/shape/format.ts` describes. It reads through a {@link MetadataSource}, so tests can feed it
 * files that never touched the disk, and it writes nothing: `scripts/generate-shape.mts` does.
 */
import type {
    ClassDeclaration,
    DeclarationHistory,
    ErrorReference,
    ExternalType,
    ModuleHistory,
    ModuleVersion,
    Privilege,
    Segment,
    ShapeArgument,
    ShapeDeclaration,
    ShapeMember,
    ShapeMethod,
    ShapeType,
    VersionStability
} from '../../src/shape/format.ts';
import { DEFAULT_VALID_RANGE, isNumberType, isPrimitiveType } from '../../src/shape/format.ts';
import { compareVersions } from '../../src/shape/version.ts';
import { isRecord } from '../isRecord.mts';
import type { ShapeOverride } from './overrides.mts';

/** The files of one `metadata/script_modules/@minecraft` directory. */
export interface MetadataSource {
    /** The file names, such as `server_2.10.0.json`. */
    readonly files: readonly string[];
    /** Parses one file. */
    read(file: string): unknown;
}

/** Which versions to generate and which corrections to apply. */
export interface GenerateOptions {
    /** Keeps a version; every stable version when absent. */
    readonly includeVersion?: (version: string, stability: VersionStability) => boolean;
    readonly overrides?: readonly ShapeOverride[];
}

/** Everything one run produced. */
export interface GeneratedShape {
    /** One history per public module, by module name. */
    readonly histories: ReadonlyMap<string, ModuleHistory>;
    /** For each override id, the versions it changed. */
    readonly applied: ReadonlyMap<string, readonly string[]>;
}

// ---------------------------------------------------------------------------
// The metadata's own layout. The files are parsed JSON, so these describe what the generator reads
// and `expectKeys` fails on a key it does not know, rather than dropping it unseen.
// ---------------------------------------------------------------------------

interface RawModuleReference {
    name: string;
    uuid?: string;
    version?: string;
}

interface RawType {
    name: string;
    is_bind_type: boolean;
    is_errorable: boolean;
    error_types?: RawType[];
    from_module?: RawModuleReference;
    valid_range?: { min: number; max: number };
    optional_type?: RawType;
    variant_types?: RawType[];
    element_type?: RawType;
    key_type?: RawType;
    value_type?: RawType;
    closure_type?: { argument_types: RawType[]; return_type: RawType; call_privilege?: RawPrivilege };
    promise_type?: RawType;
    generator_type?: { next_type: RawType; return_type: RawType; yield_type: RawType };
    generic_base?: RawType;
    generic_types?: RawType[];
}

interface RawPrivilege {
    name: Privilege;
}

interface RawArgument {
    name: string;
    type: RawType;
    details?: {
        default_value?: string | number | boolean;
        min_value?: number;
        max_value?: number;
        max_length?: number;
    } | null;
}

interface RawFunction {
    name: string;
    arguments: RawArgument[];
    return_type: RawType;
    call_privilege: RawPrivilege[];
    is_constructor: boolean;
    is_static?: boolean;
    is_script_generated?: boolean;
    raw_script_text?: string;
}

interface RawProperty {
    name: string;
    type: RawType;
    is_read_only: boolean;
    is_static?: boolean;
    is_baked?: boolean;
    get_privilege?: RawPrivilege[];
    set_privilege?: RawPrivilege[];
    min_value?: number;
    max_value?: number;
}

interface RawConstant {
    name: string;
    type: RawType;
    value: string | number | boolean;
    is_static?: boolean;
}

interface RawClass {
    name: string;
    type: RawType;
    base_types: RawType[];
    functions: RawFunction[];
    properties: RawProperty[];
    constants: RawConstant[];
    iterator?: RawType;
    runtime_conditions?: string[];
}

interface RawInterface {
    name: string;
    type: RawType;
    base_types: RawType[];
    properties: RawProperty[];
}

interface RawEnum {
    name: string;
    constants: RawConstant[];
}

interface RawError {
    name: string;
    type: RawType;
    functions: RawFunction[];
    properties: RawProperty[];
}

interface RawObject {
    name: string;
    type: RawType;
}

interface RawPeerDependency {
    name: string;
    types_only?: boolean;
    version?: string;
    versions?: { version: string }[];
}

/** A file that holds an API: a bindings module, or a module with no stub such as `@minecraft/common`. */
interface RawApi {
    name: string;
    uuid: string;
    classes: RawClass[];
    interfaces: RawInterface[];
    enums: RawEnum[];
    errors: RawError[];
    objects: RawObject[];
    constants: RawConstant[];
    functions: RawFunction[];
    dependencies: unknown[];
    peer_dependencies: RawPeerDependency[];
}

/** A public module's stub, which names the bindings module that holds its API. */
interface RawStub {
    name: string;
    uuid: string;
    parentModule: { name: string; version: string };
    wrapper_module?: string;
    peer_dependencies: RawPeerDependency[];
}

/** Keys of a metadata entry that carry nothing the shape keeps, by the entry they appear on. */
const IGNORED = {
    // `is_*` flags on a type restate what its name and fields say. `generic_function_types` and
    // `type_aliases` only serve TypeScript, and `raw_script_text` keeps the signature they describe.
    type: ['is_bind_type', 'is_errorable', 'is_class', 'is_core', 'is_enum', 'is_interface', 'is_type', 'is_optional'],
    function: ['generic_function_types', 'is_script_generated'],
    module: ['module_type', 'type_aliases']
} as const;

const KNOWN_KEYS = {
    type: [
        'name',
        'error_types',
        'from_module',
        'valid_range',
        'optional_type',
        'variant_types',
        'element_type',
        'key_type',
        'value_type',
        'closure_type',
        'promise_type',
        'generator_type',
        'generic_base',
        'generic_types',
        ...IGNORED.type
    ],
    argument: ['name', 'type', 'details'],
    function: [
        'name',
        'arguments',
        'return_type',
        'call_privilege',
        'is_constructor',
        'is_static',
        'raw_script_text',
        ...IGNORED.function
    ],
    property: [
        'name',
        'type',
        'is_read_only',
        'is_static',
        'is_baked',
        'get_privilege',
        'set_privilege',
        'min_value',
        'max_value'
    ],
    constant: ['name', 'type', 'value', 'is_read_only', 'is_static'],
    class: ['name', 'type', 'base_types', 'functions', 'properties', 'constants', 'iterator', 'runtime_conditions'],
    module: [
        'name',
        'uuid',
        'classes',
        'interfaces',
        'enums',
        'errors',
        'objects',
        'constants',
        'functions',
        'peer_dependencies',
        'parentModule',
        'wrapper_module',
        'dependencies',
        ...IGNORED.module
    ]
} as const;

/** Fails on a key the generator has not been taught, so a new metadata field is never dropped unseen. */
const expectKeys = (value: object, known: readonly string[], where: string): void => {
    for (const key of Object.keys(value)) {
        if (!known.includes(key))
            throw new Error(`${where} has the key ${key}, which the shape generator does not read`);
    }
};

// ---------------------------------------------------------------------------
// Files and versions
// ---------------------------------------------------------------------------

const FILE_PATTERN = /^(?<name>[a-z-]+)_(?<version>\d+\.\d+\.\d+(?:-[a-z0-9.]+)?)\.json$/;
const SCOPE = '@minecraft/';

interface VersionFile {
    readonly file: string;
    readonly module: string;
    readonly version: string;
}

const stabilityOf = (version: string): VersionStability => (version.includes('-') ? 'beta' : 'stable');

const listFiles = (source: MetadataSource): VersionFile[] =>
    source.files.flatMap((file) => {
        const match = FILE_PATTERN.exec(file);
        if (match?.groups === undefined) return [];
        return [{ file, module: `${SCOPE}${match.groups.name}`, version: match.groups.version ?? '' }];
    });

// ---------------------------------------------------------------------------
// Normalizing one version
// ---------------------------------------------------------------------------

/** Maps a bindings module's name, which `from_module` uses, to the public module it backs. */
type ModuleAliases = ReadonlyMap<string, string>;

const privileges = (raw: RawPrivilege[] | undefined): Privilege[] => (raw ?? []).map((entry) => entry.name).sort();

class Normalizer {
    private readonly aliases: ModuleAliases;
    private readonly where: string;

    public constructor(aliases: ModuleAliases, where: string) {
        this.aliases = aliases;
        this.where = where;
    }

    public type(raw: RawType, path: string): ShapeType {
        expectKeys(raw, KNOWN_KEYS.type, `${this.where} ${path}`);
        if (raw.error_types !== undefined) {
            throw new Error(`${this.where} ${path} carries error_types inside a type, where the shape keeps none`);
        }
        return this.inner(raw, path);
    }

    /** A type and the errors its member may throw, which the metadata records on the outer type. */
    public outer(raw: RawType, path: string): { type: ShapeType; throws?: ErrorReference[] } {
        const { error_types: errors, ...rest } = raw;
        const type = this.type(rest, path);
        if (errors === undefined || errors.length === 0) return { type };
        // A plain `Error` there is JavaScript's own, not a declaration.
        const reference = (error: RawType): ErrorReference =>
            error.name === 'Error' && !error.is_bind_type ? 'Error' : this.reference(error, `${path} error`);
        return { type, throws: errors.map(reference) };
    }

    public reference(raw: RawType, path: string): string | ExternalType {
        const type = this.type(raw, path);
        if (typeof type === 'string' || type.kind === 'external') return type;
        throw new Error(`${this.where} ${path} is not a declaration`);
    }

    private inner(raw: RawType, path: string): ShapeType {
        const at = (child: RawType | undefined, label: string): ShapeType => {
            if (child === undefined) throw new Error(`${this.where} ${path} has no ${label}`);
            return this.type(child, `${path} ${label}`);
        };
        switch (raw.name) {
            case 'optional':
                return { kind: 'optional', type: at(raw.optional_type, 'optional_type') };
            case 'variant':
                return {
                    kind: 'variant',
                    types: (raw.variant_types ?? []).map((type) => this.type(type, `${path} variant`))
                };
            case 'array':
                return { kind: 'array', element: at(raw.element_type, 'element_type') };
            case 'map':
                return { kind: 'map', key: at(raw.key_type, 'key_type'), value: at(raw.value_type, 'value_type') };
            case 'promise':
                return { kind: 'promise', type: at(raw.promise_type, 'promise_type') };
            case 'closure': {
                const closure = raw.closure_type;
                if (closure === undefined) throw new Error(`${this.where} ${path} has no closure_type`);
                // A closure names one privilege, where a member lists several.
                const privilege = closure.call_privilege === undefined ? undefined : [closure.call_privilege.name];
                return {
                    kind: 'closure',
                    arguments: closure.argument_types.map((type) => this.type(type, `${path} closure argument`)),
                    returns: this.type(closure.return_type, `${path} closure return`),
                    ...(privilege === undefined ? {} : { privilege })
                };
            }
            case 'generator': {
                const generator = raw.generator_type;
                if (generator === undefined) throw new Error(`${this.where} ${path} has no generator_type`);
                return {
                    kind: 'generator',
                    yield: this.type(generator.yield_type, `${path} yield`),
                    next: this.type(generator.next_type, `${path} next`),
                    returns: this.type(generator.return_type, `${path} return`)
                };
            }
        }
        if (raw.from_module !== undefined && raw.is_bind_type) {
            const module = this.aliases.get(raw.from_module.name) ?? raw.from_module.name;
            return { kind: 'external', module, name: raw.name };
        }
        if (raw.is_bind_type) return raw.name;
        if (isNumberType(raw.name)) {
            const range = raw.valid_range;
            if (
                range === undefined ||
                (range.min === DEFAULT_VALID_RANGE.min && range.max === DEFAULT_VALID_RANGE.max)
            ) {
                return raw.name;
            }
            return { kind: 'number', type: raw.name, min: range.min, max: range.max };
        }
        if (isPrimitiveType(raw.name)) return raw.name;
        // Generic parameters, `Record<...>` and the other types only a script-generated member names.
        return { kind: 'script', text: raw.name };
    }

    public argument(raw: RawArgument, path: string): ShapeArgument {
        expectKeys(raw, KNOWN_KEYS.argument, `${this.where} ${path}`);
        const details = raw.details ?? {};
        expectKeys(details, ['default_value', 'min_value', 'max_value', 'max_length'], `${this.where} ${path} details`);
        const fallback = details.default_value === 'null' ? null : details.default_value;
        return {
            name: raw.name,
            type: this.type(raw.type, `${path} type`),
            ...(fallback === undefined ? {} : { default: fallback }),
            ...(details.min_value === undefined ? {} : { min: details.min_value }),
            ...(details.max_value === undefined ? {} : { max: details.max_value }),
            ...(details.max_length === undefined ? {} : { maxLength: details.max_length })
        };
    }

    public callable(raw: RawFunction, path: string) {
        expectKeys(raw, KNOWN_KEYS.function, `${this.where} ${path}`);
        const { type: returns, throws } = this.outer(raw.return_type, `${path} return`);
        return {
            privilege: privileges(raw.call_privilege),
            arguments: raw.arguments.map((argument) => this.argument(argument, `${path}(${argument.name})`)),
            returns,
            ...(throws === undefined ? {} : { throws }),
            ...(raw.raw_script_text === undefined ? {} : { script: raw.raw_script_text })
        };
    }

    public function(raw: RawFunction, path: string): ShapeMember {
        const { returns, ...callable } = this.callable(raw, path);
        if (raw.is_constructor) return { kind: 'constructor', ...callable };
        return { kind: 'method', ...(raw.is_static === true ? { static: true } : {}), ...callable, returns };
    }

    public property(raw: RawProperty, path: string): ShapeMember {
        expectKeys(raw, KNOWN_KEYS.property, `${this.where} ${path}`);
        const { type, throws } = this.outer(raw.type, `${path} type`);
        return {
            kind: 'property',
            ...(raw.is_static === true ? { static: true } : {}),
            type,
            readOnly: raw.is_read_only,
            ...(raw.is_baked === true ? { baked: true } : {}),
            ...(raw.get_privilege === undefined ? {} : { get: privileges(raw.get_privilege) }),
            ...(raw.set_privilege === undefined ? {} : { set: privileges(raw.set_privilege) }),
            ...(raw.min_value === undefined ? {} : { min: raw.min_value }),
            ...(raw.max_value === undefined ? {} : { max: raw.max_value }),
            ...(throws === undefined ? {} : { throws })
        };
    }

    public constant(raw: RawConstant, path: string): ShapeMember {
        expectKeys(raw, KNOWN_KEYS.constant, `${this.where} ${path}`);
        return {
            kind: 'constant',
            ...(raw.is_static === true ? { static: true } : {}),
            type: this.type(raw.type, `${path} type`),
            value: raw.value
        };
    }

    public base(raw: RawType[], path: string): { base?: string | ExternalType } {
        if (raw.length > 1) throw new Error(`${this.where} ${path} has ${raw.length} base types`);
        const [base] = raw;
        return base === undefined ? {} : { base: this.reference(base, `${path} base`) };
    }
}

/** One version of one module: its declarations, each with its members, by name. */
interface Snapshot {
    readonly declarations: Map<string, { declaration: ShapeDeclaration; members: Map<string, ShapeMember> }>;
}

const sortedMembers = (entries: [string, ShapeMember][], where: string): Map<string, ShapeMember> => {
    const members = new Map<string, ShapeMember>();
    for (const [name, member] of entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) {
        if (members.has(name)) throw new Error(`${where} declares ${name} twice`);
        members.set(name, member);
    }
    return members;
};

const snapshotOf = (api: RawApi, aliases: ModuleAliases, where: string): Snapshot => {
    expectKeys(api, KNOWN_KEYS.module, where);
    if (api.dependencies.length > 0)
        throw new Error(`${where} has dependencies, which the shape generator does not read`);
    const normalize = new Normalizer(aliases, where);
    const declarations: Snapshot['declarations'] = new Map();
    const add = (name: string, declaration: ShapeDeclaration, members: [string, ShapeMember][] = []): void => {
        if (declarations.has(name)) throw new Error(`${where} declares ${name} twice`);
        declarations.set(name, { declaration, members: sortedMembers(members, `${where} ${name}`) });
    };

    for (const raw of api.classes) {
        expectKeys(raw, KNOWN_KEYS.class, `${where} ${raw.name}`);
        const iterator = raw.iterator === undefined ? undefined : normalize.outer(raw.iterator, `${raw.name} iterator`);
        const declaration: ClassDeclaration = {
            kind: 'class',
            ...normalize.base(raw.base_types, raw.name),
            ...(iterator === undefined ? {} : { iterator }),
            ...(raw.runtime_conditions === undefined ? {} : { conditions: raw.runtime_conditions })
        };
        add(raw.name, declaration, [
            ...raw.functions.map((fn): [string, ShapeMember] => [
                fn.name,
                normalize.function(fn, `${raw.name}.${fn.name}`)
            ]),
            ...raw.properties.map((p): [string, ShapeMember] => [
                p.name,
                normalize.property(p, `${raw.name}.${p.name}`)
            ]),
            ...raw.constants.map((c): [string, ShapeMember] => [c.name, normalize.constant(c, `${raw.name}.${c.name}`)])
        ]);
    }
    for (const raw of api.interfaces) {
        expectKeys(raw, ['name', 'type', 'base_types', 'properties'], `${where} ${raw.name}`);
        add(
            raw.name,
            { kind: 'interface', ...normalize.base(raw.base_types, raw.name) },
            raw.properties.map((p): [string, ShapeMember] => [p.name, normalize.property(p, `${raw.name}.${p.name}`)])
        );
    }
    for (const raw of api.enums) {
        expectKeys(raw, ['name', 'constants'], `${where} ${raw.name}`);
        add(
            raw.name,
            { kind: 'enum' },
            raw.constants.map((c): [string, ShapeMember] => [c.name, normalize.constant(c, `${raw.name}.${c.name}`)])
        );
    }
    for (const raw of api.errors) {
        expectKeys(raw, ['name', 'type', 'functions', 'properties'], `${where} ${raw.name}`);
        add(raw.name, { kind: 'error' }, [
            ...raw.functions.map((fn): [string, ShapeMember] => [
                fn.name,
                normalize.function(fn, `${raw.name}.${fn.name}`)
            ]),
            ...raw.properties.map((p): [string, ShapeMember] => [
                p.name,
                normalize.property(p, `${raw.name}.${p.name}`)
            ])
        ]);
    }
    for (const raw of api.objects) {
        expectKeys(raw, ['name', 'type', 'is_read_only', 'is_static'], `${where} ${raw.name}`);
        add(raw.name, { kind: 'object', type: normalize.type(raw.type, raw.name) });
    }
    for (const raw of api.constants) {
        const constant = normalize.constant(raw, raw.name);
        if (constant.kind !== 'constant') throw new Error(`${where} ${raw.name} is not a constant`);
        add(raw.name, { kind: 'constant', type: constant.type, value: constant.value });
    }
    for (const raw of api.functions) {
        const fn = normalize.function(raw, raw.name);
        if (fn.kind !== 'method') throw new Error(`${where} ${raw.name} is a module-level constructor`);
        const { kind: _kind, static: _static, ...rest } = fn;
        add(raw.name, { kind: 'function', ...rest });
    }
    return { declarations };
};

const dependenciesOf = (peers: RawPeerDependency[], aliases: ModuleAliases): Record<string, string> => {
    const dependencies: Record<string, string> = {};
    for (const peer of peers) {
        if (peer.types_only === true) continue;
        const version = peer.versions?.[0]?.version ?? peer.version;
        if (version === undefined) throw new Error(`The peer dependency ${peer.name} names no version`);
        dependencies[aliases.get(peer.name) ?? peer.name] = version;
    }
    return dependencies;
};

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

/** Applies the overrides to one snapshot, and returns the ids that found their gap in it. */
const applyOverrides = (
    module: string,
    snapshot: Snapshot,
    overrides: readonly ShapeOverride[],
    where: string
): { gaps: string[]; present: string[] } => {
    const gaps: string[] = [];
    const present: string[] = [];
    for (const override of overrides) {
        if (override.module !== module) continue;
        const entry = snapshot.declarations.get(override.declaration);
        const member = entry?.members.get(override.member);
        if (entry === undefined || member === undefined) continue;
        if (member.kind !== 'method')
            throw new Error(`Override ${override.id}: ${where} ${override.member} is not a method`);
        const index = member.arguments.findIndex((argument) => argument.name === override.argument);
        const argument = member.arguments[index];
        if (argument === undefined) {
            throw new Error(
                `Override ${override.id}: ${where} ${override.member} has no argument ${override.argument}`
            );
        }
        const closure =
            typeof argument.type === 'object' && argument.type.kind === 'closure' ? argument.type : undefined;
        if (closure === undefined) {
            throw new Error(
                `Override ${override.id}: ${where} ${override.member}(${override.argument}) is not a callback`
            );
        }
        present.push(override.id);
        if (closure.privilege !== undefined) {
            throw new Error(
                `Override ${override.id} no longer matches a gap: ${where} ${override.declaration}.${override.member}` +
                    `(${override.argument}) records the privilege ${closure.privilege.join(', ')}. Remove the override.`
            );
        }
        const patched: ShapeMethod = {
            ...member,
            arguments: member.arguments.map((each, at) =>
                at === index ? { ...each, type: { ...closure, privilege: override.privilege } } : each
            ),
            override: override.id
        };
        entry.members.set(override.member, patched);
        gaps.push(override.id);
    }
    return { gaps, present };
};

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** Folds per-version values into segments: runs of consecutive versions with an equal value. */
const segmentsOf = <Value extends object>(
    versions: readonly string[],
    valueAt: (version: string) => Value | undefined
): Segment<Value>[] => {
    const segments: Segment<Value>[] = [];
    let open: { from: string; to: string; value: Value; key: string } | undefined;
    const close = (last: boolean): void => {
        if (open === undefined) return;
        segments.push({ from: open.from, ...(last ? {} : { to: open.to }), ...open.value });
        open = undefined;
    };
    for (const version of versions) {
        const value = valueAt(version);
        if (value === undefined) {
            close(false);
            continue;
        }
        const key = JSON.stringify(value);
        if (open !== undefined && open.key === key) {
            open.to = version;
            continue;
        }
        close(false);
        open = { from: version, to: version, value, key };
    }
    close(true);
    return segments;
};

const historyOf = (versions: readonly string[], snapshots: ReadonlyMap<string, Snapshot>) => {
    const names = new Set<string>();
    for (const snapshot of snapshots.values()) for (const name of snapshot.declarations.keys()) names.add(name);
    const declarations: Record<string, DeclarationHistory> = {};
    for (const name of [...names].sort()) {
        const memberNames = new Set<string>();
        for (const snapshot of snapshots.values()) {
            for (const member of snapshot.declarations.get(name)?.members.keys() ?? []) memberNames.add(member);
        }
        const members: Record<string, Segment<ShapeMember>[]> = {};
        for (const member of [...memberNames].sort()) {
            members[member] = segmentsOf(versions, (version) =>
                snapshots.get(version)?.declarations.get(name)?.members.get(member)
            );
        }
        declarations[name] = {
            segments: segmentsOf(versions, (version) => snapshots.get(version)?.declarations.get(name)?.declaration),
            ...(memberNames.size === 0 ? {} : { members })
        };
    }
    return declarations;
};

/** The newest stable version of each major version. */
export const resolvesOf = (versions: readonly ModuleVersion[]): Record<string, string> => {
    const resolves: Record<string, string> = {};
    for (const entry of versions) {
        if (entry.stability !== 'stable') continue;
        const major = entry.version.split('.', 1)[0] ?? '';
        const current = resolves[major];
        if (current === undefined || compareVersions(entry.version, current) > 0) resolves[major] = entry.version;
    }
    return resolves;
};

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * Generates every public module's history.
 * @throws {Error} When a file holds a key the generator does not read, a declaration repeats, or
 * an override no longer matches a gap.
 */
export const generateShape = (source: MetadataSource, options: GenerateOptions = {}): GeneratedShape => {
    const include =
        options.includeVersion ?? ((_version: string, stability: VersionStability) => stability === 'stable');
    const overrides = options.overrides ?? [];
    const files = listFiles(source);
    const byKey = new Map(files.map((entry) => [`${entry.module}@${entry.version}`, entry]));
    const read = (entry: VersionFile): Record<string, unknown> => {
        const value = source.read(entry.file);
        if (!isRecord(value)) throw new Error(`${entry.file} is not an object`);
        return value;
    };

    // A stub names its bindings module, which is never imported by name.
    const aliases = new Map<string, string>();
    const contents = new Map<VersionFile, Record<string, unknown>>();
    for (const entry of files) {
        const content = read(entry);
        contents.set(entry, content);
        const parent = content.parentModule;
        if (isRecord(parent) && typeof parent.name === 'string') aliases.set(parent.name, entry.module);
    }

    const publicModules = new Map<string, VersionFile[]>();
    for (const entry of files) {
        if (aliases.has(entry.module)) continue;
        if (!include(entry.version, stabilityOf(entry.version))) continue;
        publicModules.set(entry.module, [...(publicModules.get(entry.module) ?? []), entry]);
    }

    const applied = new Map<string, string[]>(overrides.map((override) => [override.id, []]));
    const presentAnywhere = new Set<string>();
    const histories = new Map<string, ModuleHistory>();
    for (const [module, entries] of [...publicModules].sort(([left], [right]) => (left < right ? -1 : 1))) {
        entries.sort((left, right) => compareVersions(left.version, right.version));
        const versions: ModuleVersion[] = [];
        const snapshots = new Map<string, Snapshot>();
        let uuid = '';
        for (const entry of entries) {
            // Parsed JSON: `expectKeys` checks each entry against the fields `RawStub` and `RawApi` list.
            const content = contents.get(entry) as unknown as RawStub | RawApi;
            uuid = content.uuid;
            let api: RawApi;
            let stub: RawStub | undefined;
            if ('parentModule' in content) {
                stub = content;
                const parent = byKey.get(`${stub.parentModule.name}@${stub.parentModule.version}`);
                if (parent === undefined) {
                    throw new Error(
                        `${entry.file} names ${stub.parentModule.name} ${stub.parentModule.version}, which has no file`
                    );
                }
                api = contents.get(parent) as unknown as RawApi;
            } else {
                api = content;
            }
            const where = `${module} ${entry.version}`;
            const snapshot = snapshotOf(api, aliases, where);
            const { gaps, present } = applyOverrides(module, snapshot, overrides, where);
            for (const id of present) presentAnywhere.add(id);
            for (const id of gaps) applied.get(id)?.push(entry.version);
            snapshots.set(entry.version, snapshot);
            versions.push({
                version: entry.version,
                stability: stabilityOf(entry.version),
                ...(stub === undefined ? {} : { bindings: stub.parentModule.name }),
                ...(stub?.wrapper_module === undefined ? {} : { wrapper: stub.wrapper_module }),
                dependencies: dependenciesOf([...(stub?.peer_dependencies ?? []), ...api.peer_dependencies], aliases)
            });
        }
        const order = versions.map((entry) => entry.version);
        histories.set(module, {
            module,
            uuid,
            versions,
            resolves: resolvesOf(versions),
            declarations: historyOf(order, snapshots)
        });
    }

    for (const override of overrides) {
        if (!presentAnywhere.has(override.id)) {
            throw new Error(
                `Override ${override.id} no longer matches a gap: no generated version of ${override.module} has ` +
                    `${override.declaration}.${override.member}. Remove the override.`
            );
        }
    }
    return { histories, applied };
};

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

const line = (value: unknown): string => JSON.stringify(value);

/**
 * Prints a history with one version, segment or member segment per line, so a regeneration's
 * diff shows each added or changed entry on its own line.
 */
export const printHistory = (history: ModuleHistory): string => {
    const out: string[] = ['{'];
    out.push(`    "module": ${line(history.module)},`);
    out.push(`    "uuid": ${line(history.uuid)},`);
    out.push('    "versions": [');
    out.push(history.versions.map((version) => `        ${line(version)}`).join(',\n'));
    out.push('    ],');
    out.push(`    "resolves": ${line(history.resolves)},`);
    out.push('    "declarations": {');
    const declarations = Object.entries(history.declarations).map(([name, declaration]) => {
        const parts = [
            `        ${line(name)}: {`,
            '            "segments": [',
            declaration.segments.map((segment) => `                ${line(segment)}`).join(',\n'),
            declaration.members === undefined ? '            ]' : '            ],'
        ];
        if (declaration.members !== undefined) {
            parts.push('            "members": {');
            parts.push(
                Object.entries(declaration.members)
                    .map(
                        ([member, segments]) =>
                            `                ${line(member)}: [\n${segments.map((segment) => `                    ${line(segment)}`).join(',\n')}\n                ]`
                    )
                    .join(',\n')
            );
            parts.push('            }');
        }
        parts.push('        }');
        return parts.join('\n');
    });
    out.push(declarations.join(',\n'));
    out.push('    }');
    out.push('}');
    return `${out.join('\n')}\n`;
};
