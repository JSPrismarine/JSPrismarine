/**
 * The layout of the generated Script API shape in `src/generated/`, which
 * `scripts/generate-shape.mts` writes from Mojang's `metadata/script_modules`
 * ([ADR 0022](../../../../docs/adr/0022-the-script-api-surface-is-generated.md)).
 *
 * Each module has one history file. A declaration or a member is a list of segments, each with
 * the first and last version it covers, so a new game version adds lines to the diff and a
 * removal adds a `to`. This file has no imports, so the generator can share it.
 */

/** An execution privilege as the metadata names it. */
export type Privilege = 'default' | 'restricted_execution' | 'early_execution';

/** The numeric types the metadata uses. Every one crosses into a script as a JavaScript number. */
export const NUMBER_TYPES = [
    'int8',
    'uint8',
    'int16',
    'uint16',
    'int32',
    'uint32',
    'int64',
    'uint64',
    'float',
    'double'
] as const;

/** One of {@link NUMBER_TYPES}. */
export type NumberType = (typeof NUMBER_TYPES)[number];

/** The non-numeric type names that are not a class, interface or enum of the API. */
export const OTHER_PRIMITIVE_TYPES = ['boolean', 'string', 'undefined', 'void', 'any', 'unknown', 'error'] as const;

/** A type the metadata names without a declaration behind it. */
export type PrimitiveType = NumberType | (typeof OTHER_PRIMITIVE_TYPES)[number];

/**
 * The `valid_range` every numeric type in the pinned metadata carries, whatever its type: the
 * int32 range. It says nothing about the type, and BDS does not enforce it on a `double`
 * (section 3 of `docs/research/bedrock-script-api.md`), so the generator writes a range only when
 * it differs from this one.
 */
export const DEFAULT_VALID_RANGE = { min: -2147483648, max: 2147483647 } as const;

/** A class, interface, enum or error of another module, such as `@minecraft/common`'s `EngineError`. */
export interface ExternalType {
    readonly kind: 'external';
    readonly module: string;
    readonly name: string;
}

/** A number with a `valid_range` other than {@link DEFAULT_VALID_RANGE}. */
export interface RangedNumberType {
    readonly kind: 'number';
    readonly type: NumberType;
    readonly min: number;
    readonly max: number;
}

/** A value that may be `undefined`. */
export interface OptionalType {
    readonly kind: 'optional';
    readonly type: ShapeType;
}

/** A value of any one of several types. */
export interface VariantType {
    readonly kind: 'variant';
    readonly types: readonly ShapeType[];
}

/** An array of one element type. */
export interface ArrayType {
    readonly kind: 'array';
    readonly element: ShapeType;
}

/** A plain object used as a map. */
export interface MapType {
    readonly kind: 'map';
    readonly key: ShapeType;
    readonly value: ShapeType;
}

/** A function a script passes in, and the privilege it runs under when one is recorded. */
export interface ClosureType {
    readonly kind: 'closure';
    readonly arguments: readonly ShapeType[];
    readonly returns: ShapeType;
    readonly privilege?: readonly Privilege[];
}

/** A promise. */
export interface PromiseType {
    readonly kind: 'promise';
    readonly type: ShapeType;
}

/** A generator, as `system.runJob` takes one. */
export interface GeneratorType {
    readonly kind: 'generator';
    readonly yield: ShapeType;
    readonly next: ShapeType;
    readonly returns: ShapeType;
}

/**
 * A TypeScript type the metadata spells out as text, such as `BlockComponentReturnType<T>` in a
 * member with `raw_script_text`. Nothing validates it.
 */
export interface ScriptTextType {
    readonly kind: 'script';
    readonly text: string;
}

/**
 * A type in the shape. A string is a {@link PrimitiveType} or the name of a class, interface or
 * enum in the same module; {@link isPrimitiveType} tells them apart.
 */
export type ShapeType =
    | string
    | ExternalType
    | RangedNumberType
    | OptionalType
    | VariantType
    | ArrayType
    | MapType
    | ClosureType
    | PromiseType
    | GeneratorType
    | ScriptTextType;

/**
 * An error class a member may throw: a name in the same module, a type from another one, or
 * `Error`, JavaScript's own.
 */
export type ErrorReference = string | ExternalType;

/** One argument of a method, a constructor or a module function. */
export interface ShapeArgument {
    readonly name: string;
    readonly type: ShapeType;
    /**
     * `details.default_value`. Present means the argument may be left out. The metadata writes the
     * string `"null"` for an argument with no default value, which the generator writes as `null`.
     */
    readonly default?: string | number | boolean | null;
    /** `details.min_value`. */
    readonly min?: number;
    /** `details.max_value`. */
    readonly max?: number;
    /** `details.max_length`, for a string. */
    readonly maxLength?: number;
}

/** What a method, a constructor and a module function have in common. */
interface ShapeCallable {
    readonly privilege: readonly Privilege[];
    readonly arguments: readonly ShapeArgument[];
    readonly throws?: readonly ErrorReference[];
    /** `raw_script_text`: the TypeScript signature of a member the metadata cannot describe otherwise. */
    readonly script?: string;
    /** The id of the override in `scripts/shape/overrides.mts` that changed this entry. */
    readonly override?: string;
}

/** A method of a class, or a static one. */
export interface ShapeMethod extends ShapeCallable {
    readonly kind: 'method';
    readonly static?: true;
    readonly returns: ShapeType;
}

/** A class's constructor. A class without one cannot be constructed by a script. */
export interface ShapeConstructor extends ShapeCallable {
    readonly kind: 'constructor';
}

/** A property of a class, error or interface. */
export interface ShapeProperty {
    readonly kind: 'property';
    readonly static?: true;
    readonly type: ShapeType;
    readonly readOnly: boolean;
    /** `is_baked`, which the metadata does not define. */
    readonly baked?: true;
    readonly get?: readonly Privilege[];
    readonly set?: readonly Privilege[];
    /** `min_value`: the smallest number the setter accepts. */
    readonly min?: number;
    /** `max_value`: the largest number the setter accepts. */
    readonly max?: number;
    readonly throws?: readonly ErrorReference[];
    readonly override?: string;
}

/** A constant of a class or an enum. */
export interface ShapeConstant {
    readonly kind: 'constant';
    readonly static?: true;
    readonly type: ShapeType;
    readonly value: string | number | boolean;
}

/** Anything a declaration holds by name. */
export type ShapeMember = ShapeMethod | ShapeConstructor | ShapeProperty | ShapeConstant;

/** A class. Its `base` is another class it extends. */
export interface ClassDeclaration {
    readonly kind: 'class';
    readonly base?: string | ExternalType;
    /** What the class's iterator yields, for a class a script can iterate. */
    readonly iterator?: { readonly type: ShapeType; readonly throws?: readonly ErrorReference[] };
    /** `runtime_conditions`: names of the conditions the class needs, such as `Poi` in a beta. */
    readonly conditions?: readonly string[];
}

/** An interface: a plain object shape with no value at run time. */
export interface InterfaceDeclaration {
    readonly kind: 'interface';
    readonly base?: string | ExternalType;
}

/** An enum: an object of constants. */
export interface EnumDeclaration {
    readonly kind: 'enum';
}

/** An error class. Its members are its properties. */
export interface ErrorDeclaration {
    readonly kind: 'error';
}

/** A module-level object, such as `world`, of a class in the module. */
export interface ObjectDeclaration {
    readonly kind: 'object';
    readonly type: ShapeType;
}

/** A module-level constant, such as `TicksPerSecond`. */
export interface ConstantDeclaration {
    readonly kind: 'constant';
    readonly type: ShapeType;
    readonly value: string | number | boolean;
}

/** A module-level function. */
export interface FunctionDeclaration extends ShapeCallable {
    readonly kind: 'function';
    readonly returns: ShapeType;
}

/** A name a module declares. Interfaces are the only ones with no value at run time. */
export type ShapeDeclaration =
    | ClassDeclaration
    | InterfaceDeclaration
    | EnumDeclaration
    | ErrorDeclaration
    | ObjectDeclaration
    | ConstantDeclaration
    | FunctionDeclaration;

/** The versions a segment covers, by version string: `from` to `to`, or to the newest when `to` is absent. */
export interface SegmentRange {
    readonly from: string;
    readonly to?: string;
}

/** One stretch of versions over which a value stays the same. */
export type Segment<Value> = SegmentRange & Value;

/** A declaration's history, and each member's. */
export interface DeclarationHistory {
    readonly segments: readonly Segment<ShapeDeclaration>[];
    readonly members?: Readonly<Record<string, readonly Segment<ShapeMember>[]>>;
}

/** Whether a version is a stable release or a prerelease such as `2.11.0-beta`. */
export type VersionStability = 'stable' | 'beta';

/** One published version of a module. */
export interface ModuleVersion {
    readonly version: string;
    readonly stability: VersionStability;
    /** The module the stub names as its `parentModule`, which holds the API. */
    readonly bindings?: string;
    /** The stub's `wrapper_module`. */
    readonly wrapper?: string;
    /** The version of each module this one depends on, from `peer_dependencies` without `types_only`. */
    readonly dependencies: Readonly<Record<string, string>>;
}

/** The generated history of one module, the content of one file in `src/generated/`. */
export interface ModuleHistory {
    readonly module: string;
    readonly uuid: string;
    /** Every version the file covers, oldest first. Segments refer to these. */
    readonly versions: readonly ModuleVersion[];
    /**
     * The version BDS serves for each major version: the newest stable minor of that major, so a
     * pack declaring 2.0.0 gets 2.10.0.
     */
    readonly resolves: Readonly<Record<string, string>>;
    readonly declarations: Readonly<Record<string, DeclarationHistory>>;
}

/** The set of {@link OTHER_PRIMITIVE_TYPES} and {@link NUMBER_TYPES}, for lookups. */
const PRIMITIVES: ReadonlySet<string> = new Set<string>([...NUMBER_TYPES, ...OTHER_PRIMITIVE_TYPES]);

/** Whether a type name is a {@link PrimitiveType} rather than a declaration of the module. */
export const isPrimitiveType = (name: string): name is PrimitiveType => PRIMITIVES.has(name);

/** Whether a type name is one of the {@link NUMBER_TYPES}. */
export const isNumberType = (name: string): name is NumberType => (NUMBER_TYPES as readonly string[]).includes(name);
