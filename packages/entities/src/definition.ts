import type { FormatVersion } from '@jsprismarine/packs';
import { compareVersions, parseVersion } from '@jsprismarine/packs';

import type { Diagnostic } from './diagnostics';
import { DiagnosticCollector } from './diagnostics';
import type { EventNode } from './events';
import { EVENT_ACTION_VERSIONS, eventActionNames, parseEventNode } from './events';
import type { PropertyDefinition } from './properties';
import { parseProperties } from './properties';

/**
 * The entity definition model. An entity file is
 * `{"format_version": "<semver>", "minecraft:entity": {...}}`, and the entity
 * body has `description`, `components`, `component_groups`, `events` and
 * `upgrades`.
 *
 * Mojang's own `ActorDocument.json` types only those keys and leaves their
 * bodies dynamic, so this parser validates structure and reports an unknown
 * key rather than refusing the file.
 */

/** The key the entity body sits under in an entity file. */
export const ENTITY_ROOT_KEY = 'minecraft:entity';

/** The top-level keys `ActorDocument.json` declares. */
const ENTITY_KEYS = new Set(['description', 'components', 'component_groups', 'events', 'upgrades']);

/** The `description` keys the documentation names. */
const DESCRIPTION_KEYS = new Set([
    'identifier',
    'is_spawnable',
    'is_summonable',
    'is_experimental',
    'spawn_category',
    'runtime_identifier',
    'properties',
    'animations',
    'scripts',
    'entity_version'
]);

/** A component map as the file writes it: component name to raw JSON value. */
export type ComponentMap = ReadonlyMap<string, unknown>;

/** The `description.scripts` block, which names behavior animations to run. */
export interface EntityScripts {
    /** Entries of `scripts.animate`: a name, or a name mapped to a Molang condition. */
    readonly animate: readonly (string | Record<string, string>)[];
}

/** The parsed `description` block. */
export interface EntityDescription {
    readonly identifier: string;
    /** Adds a spawn egg to the creative inventory when true. */
    readonly isSpawnable: boolean;
    /** Allows `/summon` when true. */
    readonly isSummonable: boolean;
    readonly isExperimental: boolean;
    /** The pool the entity spawns with; Mojang recommends creators leave it unset. */
    readonly spawnCategory?: string;
    /** Inherits engine mechanics from a vanilla entity that has no component form. */
    readonly runtimeIdentifier?: string;
    readonly properties: ReadonlyMap<string, PropertyDefinition>;
    /** Behavior animation and animation controller names, by short name. */
    readonly animations: ReadonlyMap<string, string>;
    readonly scripts: EntityScripts;
    /** The saved-data version, which drives the `upgrades` handlers. */
    readonly entityVersion?: FormatVersion;
}

/** One parsed entity definition. */
export interface EntityDefinition {
    readonly identifier: string;
    /** The file's `format_version`, which selects how the engine reads the rest. */
    readonly formatVersion?: FormatVersion;
    readonly description: EntityDescription;
    /** The always-active component set. */
    readonly components: ComponentMap;
    /** Group name to component map, inactive until an event adds the group. */
    readonly componentGroups: ReadonlyMap<string, ComponentMap>;
    readonly events: ReadonlyMap<string, EventNode>;
    /** The `upgrades` handlers, kept raw; vanilla uses none yet. */
    readonly upgrades: unknown;
}

/** Where a definition came from, for diagnostics. */
export interface DefinitionSource {
    /** The pack the file came from. */
    pack: string;
    /** The pack-relative path of the file. */
    path?: string;
}

/** What {@link parseEntityDefinition} returns. */
export interface ParseEntityResult {
    /** The parsed definition, or undefined when the file has no usable entity body. */
    definition?: EntityDefinition;
    diagnostics: readonly Diagnostic[];
}

/** The `format_version` at which a root-level event `filters` key is read. */
const ROOT_EVENT_FILTERS_SINCE: FormatVersion = [1, 19, 20];

/** The `format_version` at which `entity_version` and `upgrades` are read. */
const UPGRADES_SINCE: FormatVersion = [1, 26, 20];

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Parses one entity file into an {@link EntityDefinition}.
 *
 * Validation is structural. A key the parser does not know loads the file
 * anyway and reports `entity.unknownKey`, because Mojang's schema types only
 * the top level and a pack written against a newer game must still load.
 *
 * @param data - The already-parsed JSON of one entity file.
 * @param source - The pack and path diagnostics name.
 */
export const parseEntityDefinition = (data: unknown, source: DefinitionSource): ParseEntityResult => {
    const collector = new DiagnosticCollector();
    const report = (severity: 'error' | 'warning', code: string, message: string): void =>
        collector.add({ severity, code, pack: source.pack, path: source.path, message });

    if (!isRecord(data)) {
        report('error', 'entity.invalid', 'an entity file must be a JSON object');
        return { diagnostics: collector.diagnostics };
    }

    const formatVersion = parseVersion(data.format_version);
    if (data.format_version !== undefined && formatVersion === undefined)
        report('warning', 'entity.invalid', `format_version ${JSON.stringify(data.format_version)} does not parse`);

    const body = data[ENTITY_ROOT_KEY];
    if (!isRecord(body)) {
        report('error', 'entity.invalid', `an entity file must have a ${ENTITY_ROOT_KEY} object`);
        return { diagnostics: collector.diagnostics };
    }

    for (const key of Object.keys(body)) {
        if (!ENTITY_KEYS.has(key)) report('warning', 'entity.unknownKey', `unknown entity key ${key}`);
    }

    const description = parseDescription(body.description, source, collector, formatVersion);
    if (description === undefined) return { diagnostics: collector.diagnostics };

    const identifier = description.identifier;
    const components = parseComponentMap(body.components, `${identifier} components`, report);
    const componentGroups = parseComponentGroups(body.component_groups, identifier, report);
    const events = parseEvents(body.events, identifier, formatVersion, report);

    if (body.upgrades !== undefined && !atLeast(formatVersion, UPGRADES_SINCE))
        report(
            'warning',
            'entity.versionGate',
            `${identifier} uses upgrades, which needs format_version 1.26.20 or newer`
        );

    return {
        definition: {
            identifier,
            formatVersion,
            description,
            components,
            componentGroups,
            events,
            upgrades: body.upgrades
        },
        diagnostics: collector.diagnostics
    };
};

const atLeast = (version: FormatVersion | undefined, minimum: FormatVersion): boolean =>
    version !== undefined && compareVersions(version, minimum) >= 0;

const parseDescription = (
    value: unknown,
    source: DefinitionSource,
    collector: DiagnosticCollector,
    formatVersion: FormatVersion | undefined
): EntityDescription | undefined => {
    const report = (severity: 'error' | 'warning', code: string, message: string): void =>
        collector.add({ severity, code, pack: source.pack, path: source.path, message });

    if (!isRecord(value)) {
        report('error', 'entity.invalid', 'an entity needs a description object');
        return undefined;
    }
    if (typeof value.identifier !== 'string' || value.identifier.length === 0) {
        report('error', 'entity.invalid', 'description.identifier must be a non-empty string');
        return undefined;
    }

    const identifier = value.identifier;
    for (const key of Object.keys(value)) {
        if (!DESCRIPTION_KEYS.has(key))
            report('warning', 'entity.unknownKey', `${identifier}: unknown description key ${key}`);
    }

    const entityVersion = value.entity_version === undefined ? undefined : parseVersion(value.entity_version);
    if (value.entity_version !== undefined && !atLeast(formatVersion, UPGRADES_SINCE))
        report(
            'warning',
            'entity.versionGate',
            `${identifier} uses entity_version, which needs format_version 1.26.20 or newer`
        );

    return {
        identifier,
        isSpawnable: value.is_spawnable === true,
        isSummonable: value.is_summonable === true,
        isExperimental: value.is_experimental === true,
        spawnCategory: typeof value.spawn_category === 'string' ? value.spawn_category : undefined,
        runtimeIdentifier: typeof value.runtime_identifier === 'string' ? value.runtime_identifier : undefined,
        properties: parseProperties(value.properties, identifier, source.pack, collector),
        animations: parseAnimations(value.animations, identifier, report),
        scripts: parseScripts(value.scripts, identifier, report),
        entityVersion
    };
};

type Report = (severity: 'error' | 'warning', code: string, message: string) => void;

const parseAnimations = (value: unknown, identifier: string, report: Report): ReadonlyMap<string, string> => {
    const animations = new Map<string, string>();
    if (value === undefined) return animations;
    if (!isRecord(value)) {
        report('warning', 'entity.invalid', `${identifier}: description.animations must be an object`);
        return animations;
    }
    for (const [name, target] of Object.entries(value)) {
        if (typeof target === 'string') animations.set(name, target);
        else report('warning', 'entity.invalid', `${identifier}: animation ${name} must name a string`);
    }
    return animations;
};

const parseScripts = (value: unknown, identifier: string, report: Report): EntityScripts => {
    if (value === undefined) return { animate: [] };
    if (!isRecord(value)) {
        report('warning', 'entity.invalid', `${identifier}: description.scripts must be an object`);
        return { animate: [] };
    }
    for (const key of Object.keys(value)) {
        if (key !== 'animate') report('warning', 'entity.unknownKey', `${identifier}: unknown scripts key ${key}`);
    }
    if (value.animate === undefined) return { animate: [] };
    if (!Array.isArray(value.animate)) {
        report('warning', 'entity.invalid', `${identifier}: scripts.animate must be an array`);
        return { animate: [] };
    }

    const animate: (string | Record<string, string>)[] = [];
    for (const entry of value.animate) {
        if (typeof entry === 'string') {
            animate.push(entry);
        } else if (isRecord(entry)) {
            const conditions: Record<string, string> = {};
            for (const [name, condition] of Object.entries(entry)) {
                if (typeof condition === 'string') conditions[name] = condition;
            }
            animate.push(conditions);
        } else {
            report('warning', 'entity.invalid', `${identifier}: scripts.animate entries must be names or conditions`);
        }
    }
    return { animate };
};

const parseComponentMap = (value: unknown, label: string, report: Report): ComponentMap => {
    const components = new Map<string, unknown>();
    if (value === undefined) return components;
    if (!isRecord(value)) {
        report('warning', 'entity.invalid', `${label} must be an object of component name to value`);
        return components;
    }
    for (const [name, body] of Object.entries(value)) components.set(name, body);
    return components;
};

const parseComponentGroups = (
    value: unknown,
    identifier: string,
    report: Report
): ReadonlyMap<string, ComponentMap> => {
    const groups = new Map<string, ComponentMap>();
    if (value === undefined) return groups;
    if (!isRecord(value)) {
        report('warning', 'entity.invalid', `${identifier}: component_groups must be an object`);
        return groups;
    }
    for (const [name, body] of Object.entries(value)) {
        groups.set(name, parseComponentMap(body, `${identifier} component group ${name}`, report));
    }
    return groups;
};

const parseEvents = (
    value: unknown,
    identifier: string,
    formatVersion: FormatVersion | undefined,
    report: Report
): ReadonlyMap<string, EventNode> => {
    const events = new Map<string, EventNode>();
    if (value === undefined) return events;
    if (!isRecord(value)) {
        report('warning', 'entity.invalid', `${identifier}: events must be an object`);
        return events;
    }

    for (const [name, body] of Object.entries(value)) {
        const node = parseEventNode(body, (code, message) =>
            report('warning', code, `${identifier} event ${name}: ${message}`)
        );
        events.set(name, node);

        if (node.filters !== undefined && !atLeast(formatVersion, ROOT_EVENT_FILTERS_SINCE))
            report(
                'warning',
                'entity.versionGate',
                `${identifier} event ${name} has root-level filters, which need format_version 1.19.20 or newer`
            );

        for (const action of eventActionNames(node)) {
            const since = EVENT_ACTION_VERSIONS.get(action);
            if (since !== undefined && !atLeast(formatVersion, since))
                report(
                    'warning',
                    'entity.versionGate',
                    `${identifier} event ${name} uses ${action}, which needs format_version ${since.join('.')} or newer`
                );
        }
    }
    return events;
};
