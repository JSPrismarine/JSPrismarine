import type {
    BehaviorRegistry,
    BindContext,
    BoundComponent,
    ComponentEntry,
    ComponentRegistry,
    Definition,
    Type
} from '@jsprismarine/content';
import { resolveTypes } from '@jsprismarine/content';

import type { EntityDefinition } from './definition';
import type { Diagnostic } from './diagnostics';
import { DiagnosticCollector } from './diagnostics';
import type { EntityHooks } from './hooks';

/**
 * The second content layer for entities: a definition resolved once at load.
 *
 * The base `components` resolve through `@jsprismarine/content`'s
 * `resolveTypes`, which binds them, attaches behaviors and builds the dispatch
 * table. The `component_groups` bind here against the same registry and stay
 * on the type, because which of them is active is per entity rather than per
 * type.
 */

/** The registry an entity domain fills with component factories. */
export type EntityComponentRegistry = ComponentRegistry<EntityHooks>;

/** Looks up Java datapack tags for the Bedrock identifier of an entity type. */
export type EntityTypeTagLookup = (identifier: string) => readonly string[];

/** The load-time flags an entity type carries. */
export type EntityTypeFlag = 'spawnable' | 'summonable' | 'experimental';

/** One component group, bound once at load. */
export interface ResolvedComponentGroup {
    readonly name: string;
    /** The components that bound, in declaration order; a rejected one is absent. */
    readonly components: readonly BoundComponent<EntityHooks>[];
}

/** A definition resolved into a type, with its groups and its coverage report. */
export interface EntityType extends Type<EntityHooks, EntityTypeFlag> {
    /** The parsed definition the type came from. */
    readonly entity: EntityDefinition;
    /** Java datapack entity type tags that include this Bedrock entity identifier. */
    readonly tags: readonly string[];
    /** Whether a Java datapack entity type tag includes this entity. */
    hasTag(tag: string): boolean;
    /** Group name to its bound components. */
    readonly groups: ReadonlyMap<string, ResolvedComponentGroup>;
    /** Every component name the definition uses, base and groups, in name order. */
    readonly declaredComponents: readonly string[];
    /** The subset of {@link EntityType.declaredComponents} no factory implements. */
    readonly unimplementedComponents: readonly string[];
}

/** One definition to resolve, with where it came from. */
export interface EntityDefinitionInput {
    readonly definition: EntityDefinition;
    /** The pack the definition came from; diagnostics name it. */
    readonly pack: string;
    /** The pack-relative path of the file. */
    readonly path?: string;
}

/** Options for {@link resolveEntityTypes}. */
export interface ResolveEntityOptions {
    /** The component names this domain implements. */
    components: EntityComponentRegistry;
    /** Behaviors the server and its plugins attach by identifier. */
    behaviors?: BehaviorRegistry<EntityHooks>;
    /** Java datapack tags, mapped to the Bedrock identifier for each type. */
    tagLookup?: EntityTypeTagLookup;
    /** Fail the resolve when any diagnostic is reported. */
    strict?: boolean;
}

/** What {@link resolveEntityTypes} returns. */
export interface ResolveEntityResult {
    /** Identifier to type, in input order, ready for `Registry.rebuild`. */
    types: ReadonlyMap<string, EntityType>;
    diagnostics: readonly Diagnostic[];
}

/**
 * Resolves parsed entity definitions into entity types.
 *
 * A component name no factory implements resolves the type anyway and is
 * reported once per pack, so "component not implemented" is a line in the load
 * report rather than a missing entity.
 *
 * @throws {Error} In strict mode, when any diagnostic is reported; the error
 *   comes from `resolveTypes` and carries the whole report.
 */
export const resolveEntityTypes = (
    inputs: Iterable<EntityDefinitionInput>,
    options: ResolveEntityOptions
): ResolveEntityResult => {
    const collector = new DiagnosticCollector();
    const parsed = new Map<string, EntityDefinitionInput>();
    const definitions: Definition[] = [];

    for (const input of inputs) {
        parsed.set(input.definition.identifier, input);
        definitions.push({
            identifier: input.definition.identifier,
            registry: 'entities',
            pack: input.pack,
            path: input.path ?? '',
            data: input.definition
        });
    }

    const read = (definition: Definition): Iterable<ComponentEntry> => {
        const entity = parsed.get(definition.identifier)?.definition;
        if (entity === undefined) return [];
        return [...normalizeLegacyOffspring(entity.components)].map(([name, value]) => ({ name, value }));
    };

    const resolved = resolveTypes<EntityHooks, Record<EntityTypeFlag, unknown>>(definitions, {
        components: options.components,
        behaviors: options.behaviors,
        read,
        flags: {
            spawnable: (type) => parsed.get(type.identifier)?.definition.description.isSpawnable === true,
            summonable: (type) => parsed.get(type.identifier)?.definition.description.isSummonable === true,
            experimental: (type) => parsed.get(type.identifier)?.definition.description.isExperimental === true
        },
        strict: options.strict
    });

    for (const diagnostic of resolved.diagnostics) collector.add(diagnostic);

    const types = new Map<string, EntityType>();
    for (const [identifier, type] of resolved.types) {
        const input = parsed.get(identifier);
        if (input === undefined) continue;
        types.set(identifier, buildEntityType(type, input, options.components, collector, options.tagLookup));
    }

    return { types, diagnostics: collector.diagnostics };
};

const buildEntityType = (
    type: Type<EntityHooks, EntityTypeFlag>,
    input: EntityDefinitionInput,
    components: EntityComponentRegistry,
    collector: DiagnosticCollector,
    tagLookup: EntityTypeTagLookup | undefined
): EntityType => {
    const entity = input.definition;
    const context: BindContext = {
        identifier: entity.identifier,
        definition: {
            identifier: entity.identifier,
            registry: 'entities',
            pack: input.pack,
            path: input.path ?? '',
            data: entity
        }
    };

    const groups = new Map<string, ResolvedComponentGroup>();
    const declared = new Set<string>(normalizeLegacyOffspring(entity.components).keys());
    const tags = [...new Set(tagLookup?.(entity.identifier) ?? [])];

    for (const [name, map] of entity.componentGroups) {
        const bound: BoundComponent<EntityHooks>[] = [];
        for (const [component, value] of normalizeLegacyOffspring(map)) {
            declared.add(component);
            if (!components.has(component)) {
                collector.add({
                    severity: 'warning',
                    code: 'component.unknown',
                    pack: input.pack,
                    path: input.path,
                    message: `no component is registered as ${component}`
                });
                continue;
            }
            const result = components.bind(component, value, context);
            if (!result.ok) {
                collector.add({
                    severity: 'error',
                    code: 'component.invalid',
                    pack: input.pack,
                    path: input.path,
                    message: `${entity.identifier} group ${name} component ${component}: ${result.message}`
                });
                continue;
            }
            bound.push(result.value);
        }
        groups.set(name, { name, components: bound });
    }

    const declaredComponents = [...declared].sort();
    return {
        ...type,
        entity,
        tags,
        hasTag: (tag) => tags.includes(tag),
        groups,
        declaredComponents,
        unimplementedComponents: declaredComponents.filter((name) => !components.has(name))
    };
};

/**
 * Maps the former offspring component name to its current data component for resolved types.
 *
 * @param components - The component map parsed from a definition or component group.
 * @returns A normalized map; the parsed entity definition remains unchanged.
 */
const normalizeLegacyOffspring = (components: ReadonlyMap<string, unknown>): ReadonlyMap<string, unknown> => {
    if (!components.has('minecraft:offspring')) return components;

    const normalized = new Map(components);
    const legacy = normalized.get('minecraft:offspring');
    const current = normalized.get('minecraft:offspring_data');
    if (!normalized.has('minecraft:offspring_data') || !isRecord(current)) {
        normalized.set('minecraft:offspring_data', legacy);
    } else if (isRecord(legacy)) {
        const legacyPairs = isRecord(legacy.offspring_pairs) ? legacy.offspring_pairs : {};
        const currentPairs = isRecord(current.offspring_pairs) ? current.offspring_pairs : {};
        const merged = { ...legacy, ...current };
        if (Object.keys(legacyPairs).length > 0 || Object.keys(currentPairs).length > 0)
            merged.offspring_pairs = { ...legacyPairs, ...currentPairs };
        normalized.set('minecraft:offspring_data', merged);
    }
    normalized.delete('minecraft:offspring');
    return normalized;
};

/** Whether a JSON component body is a plain object. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
