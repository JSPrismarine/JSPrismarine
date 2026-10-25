import type { DiagnosticCollector } from './diagnostics';

/**
 * Entity properties, the `description.properties` system. A property is a
 * named, typed, persisted value an event writes through `set_property`, Molang
 * reads through `query.property`, and filters read through `int_property`,
 * `float_property`, `bool_property`, `enum_property` and `has_property`.
 */

/** The four property types the engine supports. */
export const PROPERTY_TYPES = ['int', 'float', 'bool', 'enum'] as const;

/** One of {@link PROPERTY_TYPES}. */
export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** A property value at run time; an enum property holds the member's name. */
export type PropertyValue = number | boolean | string;

/**
 * A declared default. The engine accepts a literal or a Molang expression,
 * and a default expression may only call `query.had_component_group`.
 */
export type PropertyDefault =
    { readonly kind: 'literal'; readonly value: PropertyValue } | { readonly kind: 'molang'; readonly source: string };

/** One declared property, after its type, range or value list is validated. */
export interface PropertyDefinition {
    readonly name: string;
    readonly type: PropertyType;
    readonly default: PropertyDefault;
    /** Sent to clients for render and animation controllers when true. */
    readonly clientSync: boolean;
    /** The inclusive bounds of an `int` or `float` property; writes clamp into it. */
    readonly range?: readonly [number, number];
    /** The members of an `enum` property, in declaration order. */
    readonly values?: readonly string[];
}

/** At most 32 properties per entity type, per the entity properties documentation. */
export const MAX_PROPERTIES_PER_ENTITY = 32;

/** At most 16 members per enum property, per the entity properties documentation. */
export const MAX_ENUM_VALUES = 16;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isEnumMemberName = (value: string): boolean => /^[A-Za-z][\w]{0,31}$/.test(value);

/**
 * Parses one `description.properties` entry.
 *
 * A malformed entry reports and yields undefined rather than throwing, so one
 * bad property does not cost the whole entity.
 *
 * @param report - Where to send findings; each names the property.
 * @returns The parsed property, or undefined when the entry is unusable.
 */
export const parsePropertyDefinition = (
    name: string,
    value: unknown,
    report: (code: string, message: string) => void
): PropertyDefinition | undefined => {
    if (!isRecord(value)) {
        report('property.invalid', `property ${name} must be an object`);
        return undefined;
    }

    const type = PROPERTY_TYPES.find((candidate) => candidate === value.type);
    if (type === undefined) {
        report('property.invalid', `property ${name} has no known type, got ${JSON.stringify(value.type)}`);
        return undefined;
    }

    const clientSync = value.client_sync === true;
    const range =
        (type === 'int' || type === 'float') && value.range !== undefined
            ? parseRange(name, value.range, type, report)
            : undefined;
    const values = type === 'enum' ? parseEnumValues(name, value.values, report) : undefined;
    if (type === 'enum' && values === undefined) return undefined;

    const declared = parseDefault(name, type, value.default, report);
    if (declared === undefined) return undefined;

    const definition: PropertyDefinition = { name, type, default: declared, clientSync, range, values };
    if (declared.kind === 'literal' && coerce(definition, declared.value) === undefined) {
        report('property.invalid', `property ${name} has a default outside its declared ${type} domain`);
        return undefined;
    }
    return definition;
};

const parseRange = (
    name: string,
    value: unknown,
    type: PropertyType,
    report: (code: string, message: string) => void
): readonly [number, number] | undefined => {
    if (!Array.isArray(value) || value.length !== 2 || value.some((part) => typeof part !== 'number')) {
        report('property.invalid', `property ${name} range must be two numbers`);
        return undefined;
    }
    const [min, max] = [Number(value[0]), Number(value[1])];
    if (type === 'int' && (!Number.isInteger(min) || !Number.isInteger(max)))
        report('property.invalid', `property ${name} is an int property with a fractional range`);
    return min <= max ? [min, max] : [max, min];
};

const parseEnumValues = (
    name: string,
    value: unknown,
    report: (code: string, message: string) => void
): readonly string[] | undefined => {
    if (!Array.isArray(value) || value.length === 0 || value.some((member) => typeof member !== 'string')) {
        report('property.invalid', `property ${name} must list its enum values as strings`);
        return undefined;
    }
    const members = value.filter((member) => typeof member === 'string');
    if (members.length > MAX_ENUM_VALUES)
        report('property.invalid', `property ${name} has ${members.length} enum values, over the documented 16`);
    for (const member of members) {
        if (!isEnumMemberName(member))
            report(
                'property.invalid',
                `property ${name} enum value ${JSON.stringify(member)} must start with a letter and be at most 32 characters`
            );
    }
    return members;
};

const parseDefault = (
    name: string,
    type: PropertyType,
    value: unknown,
    report: (code: string, message: string) => void
): PropertyDefault | undefined => {
    if (value === undefined) {
        report('property.invalid', `property ${name} has no default`);
        return undefined;
    }
    // An expression is written as a string, which is also how an enum member is
    // written, so only a non-enum string can be Molang.
    if (typeof value === 'string' && type !== 'enum') return { kind: 'molang', source: value };
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
        return { kind: 'literal', value };
    report('property.invalid', `property ${name} has a default that is not a literal or an expression`);
    return undefined;
};

/**
 * Brings a value into a property's domain: an `int` rounds and clamps, a
 * `float` clamps, a `bool` accepts a boolean or Molang's 0 and 1, and an
 * `enum` accepts one of its declared members.
 *
 * Clamping is silent, which is what the engine documents for `int` and
 * `float`.
 *
 * @returns The stored value, or undefined when the value has no place in the domain.
 */
export const coerce = (definition: PropertyDefinition, value: PropertyValue): PropertyValue | undefined => {
    switch (definition.type) {
        case 'bool':
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value !== 0;
            return undefined;
        case 'int':
        case 'float': {
            const numeric = typeof value === 'boolean' ? (value ? 1 : 0) : value;
            if (typeof numeric !== 'number' || !Number.isFinite(numeric)) return undefined;
            const rounded = definition.type === 'int' ? Math.round(numeric) : numeric;
            if (definition.range === undefined) return rounded;
            const [min, max] = definition.range;
            return Math.min(max, Math.max(min, rounded));
        }
        case 'enum':
            return typeof value === 'string' && definition.values?.includes(value) ? value : undefined;
    }
};

/**
 * The live property values of one entity.
 *
 * The store is keyed by property name, which is also how the engine persists
 * them, so renaming a property discards the saved value.
 */
export class PropertyValues {
    private readonly values = new Map<string, PropertyValue>();

    /**
     * @param definitions - The entity type's declared properties, by name.
     * @param resolveDefault - Evaluates a Molang default; returns undefined to fall back to the type's zero value.
     */
    public constructor(
        private readonly definitions: ReadonlyMap<string, PropertyDefinition>,
        resolveDefault?: (definition: PropertyDefinition, source: string) => PropertyValue | undefined
    ) {
        for (const definition of definitions.values()) {
            const declared =
                definition.default.kind === 'literal'
                    ? definition.default.value
                    : (resolveDefault?.(definition, definition.default.source) ?? zeroValue(definition));
            this.values.set(definition.name, coerce(definition, declared) ?? zeroValue(definition));
        }
    }

    /** Whether the entity type declares the property. */
    public has(name: string): boolean {
        return this.definitions.has(name);
    }

    /** The declared property, or undefined when the entity type has none under the name. */
    public definition(name: string): PropertyDefinition | undefined {
        return this.definitions.get(name);
    }

    /** The current value, or undefined when the entity type declares no such property. */
    public get(name: string): PropertyValue | undefined {
        return this.values.get(name);
    }

    /** Every declared property name, in declaration order. */
    public names(): readonly string[] {
        return [...this.definitions.keys()];
    }

    /**
     * Writes a property, clamping an `int` or `float` into its range.
     *
     * @returns The stored value, or undefined when the property is undeclared
     *   or the value has no place in its domain; neither writes anything.
     */
    public set(name: string, value: PropertyValue): PropertyValue | undefined {
        const definition = this.definitions.get(name);
        if (definition === undefined) return undefined;
        const stored = coerce(definition, value);
        if (stored === undefined) return undefined;
        this.values.set(name, stored);
        return stored;
    }
}

/** The value a property falls back to when its declared default does not resolve. */
const zeroValue = (definition: PropertyDefinition): PropertyValue => {
    switch (definition.type) {
        case 'bool':
            return false;
        case 'enum':
            return definition.values?.[0] ?? '';
        default:
            return definition.range?.[0] ?? 0;
    }
};

/**
 * Parses a whole `description.properties` map, reporting the documented limit
 * of 32 properties per entity type rather than refusing the extras.
 */
export const parseProperties = (
    value: unknown,
    identifier: string,
    pack: string,
    collector: DiagnosticCollector
): ReadonlyMap<string, PropertyDefinition> => {
    const properties = new Map<string, PropertyDefinition>();
    if (value === undefined) return properties;

    const report = (code: string, message: string): void =>
        collector.add({ severity: 'warning', code, pack, message: `${identifier}: ${message}` });

    if (!isRecord(value)) {
        report('property.invalid', 'description.properties must be an object');
        return properties;
    }

    for (const [name, body] of Object.entries(value)) {
        const parsed = parsePropertyDefinition(name, body, report);
        if (parsed !== undefined) properties.set(name, parsed);
    }

    if (properties.size > MAX_PROPERTIES_PER_ENTITY)
        report('property.invalid', `declares ${properties.size} properties, over the documented 32`);

    return properties;
};
