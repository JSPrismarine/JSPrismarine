import type { Filter } from '@jsprismarine/packs';
import { FilterParseError } from '@jsprismarine/packs';

import { parseEntityFilter } from './filterSource';

/**
 * The event grammar. An event is a node, and a node nests indefinitely through
 * `sequence`, `randomize` and `first_valid`. Parsing normalizes every shape the
 * vanilla pack writes into one {@link EventNode} so the engine walks a single
 * structure.
 */

/** Whom a `trigger` entry fires its event on. */
export const EVENT_TARGETS = ['self', 'other', 'player', 'target', 'baby', 'parent', 'holder', 'block'] as const;

/** One of {@link EVENT_TARGETS}; `self` when the file writes none. */
export type EventTarget = (typeof EVENT_TARGETS)[number];

/**
 * A value an event writes. A number or a boolean is a literal. A string is
 * ambiguous in the file, because the engine reads a `set_property` string as
 * Molang and vanilla also writes enum members bare, so the parser keeps the
 * text and the engine resolves it against the property it is writing.
 */
export type EventValue =
    { readonly kind: 'literal'; readonly value: number | boolean } | { readonly kind: 'text'; readonly text: string };

/** One `set_property` write. */
export interface PropertyWrite {
    readonly name: string;
    readonly value: EventValue;
}

/** One `trigger` entry: an event name, whom to fire it on, and an optional gate. */
export interface EventTrigger {
    readonly event: string;
    readonly target: EventTarget;
    readonly filters?: Filter;
}

/**
 * An action the engine performs that changes nothing this package models:
 * sounds, particles, vibrations, commands and the five actions vanilla uses
 * that appear in no documentation page. The payload is kept raw so a later
 * agent can implement one without reparsing the file.
 */
export interface EventAction {
    /** The action key as the file writes it, such as `play_sound`. */
    readonly name: string;
    readonly value: unknown;
}

/** One node of `randomize`, with the weight the engine draws against. */
export interface WeightedEventNode {
    readonly weight: number;
    readonly node: EventNode;
}

/** One event node, with every branch normalized to an array. */
export interface EventNode {
    /** Gates the whole node; absent means the node always runs. */
    readonly filters?: Filter;
    /** Component groups to add, in file order. */
    readonly add: readonly string[];
    /** Component groups to remove, in file order. */
    readonly remove: readonly string[];
    readonly setProperties: readonly PropertyWrite[];
    readonly triggers: readonly EventTrigger[];
    /** Child nodes run in order; a later one's filters do not see an earlier one's changes. */
    readonly sequence: readonly EventNode[];
    /** Child nodes of which exactly one runs, drawn against the weights. */
    readonly randomize: readonly WeightedEventNode[];
    /** Child nodes of which the first whose filters pass runs. */
    readonly firstValid: readonly EventNode[];
    /** Everything else the node asks for, kept raw. */
    readonly actions: readonly EventAction[];
}

/**
 * The action keys `EventActions.md` documents, with the `format_version` each
 * needs. An action used below its version loads anyway and is reported, which
 * is the lenient reading `format_version` dispatch calls for.
 */
export const EVENT_ACTION_VERSIONS: ReadonlyMap<string, readonly [number, number, number]> = new Map([
    ['queue_command', [1, 20, 60]],
    ['emit_particle', [1, 21, 50]],
    ['play_sound', [1, 21, 50]]
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const asArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [value]);

/** An empty node, which is what an unusable event body parses to. */
const EMPTY: EventNode = {
    add: [],
    remove: [],
    setProperties: [],
    triggers: [],
    sequence: [],
    randomize: [],
    firstValid: [],
    actions: []
};

/** How the parser reports a finding about one node. */
export type EventReport = (code: string, message: string) => void;

/**
 * Parses one event node, including every nested node.
 *
 * Nothing throws: an unusable branch reports and is left out, because an
 * entity whose one broken event is dropped still runs.
 */
export const parseEventNode = (value: unknown, report: EventReport): EventNode => {
    if (!isRecord(value)) {
        report('event.invalid', `an event node must be an object, got ${JSON.stringify(value)}`);
        return EMPTY;
    }

    const add: string[] = [];
    const remove: string[] = [];
    const setProperties: PropertyWrite[] = [];
    const triggers: EventTrigger[] = [];
    const sequence: EventNode[] = [];
    const randomize: WeightedEventNode[] = [];
    const firstValid: EventNode[] = [];
    const actions: EventAction[] = [];

    for (const [key, body] of Object.entries(value)) {
        switch (key) {
            case 'add':
                add.push(...parseComponentGroups(key, body, report));
                break;
            case 'remove':
                remove.push(...parseComponentGroups(key, body, report));
                break;
            case 'set_property':
                setProperties.push(...parseSetProperty(body, report));
                break;
            case 'trigger':
                triggers.push(...parseTriggers(body, report));
                break;
            case 'sequence':
                sequence.push(...parseChildren(key, body, report));
                break;
            case 'randomize':
                randomize.push(...parseRandomize(body, report));
                break;
            case 'first_valid':
                firstValid.push(...parseChildren(key, body, report));
                break;
            case 'filters':
            case 'weight':
                break;
            default:
                actions.push({ name: key, value: body });
                break;
        }
    }

    return {
        filters: parseNodeFilter(value.filters, report),
        add,
        remove,
        setProperties,
        triggers,
        sequence,
        randomize,
        firstValid,
        actions
    };
};

const parseNodeFilter = (value: unknown, report: EventReport): Filter | undefined => {
    if (value === undefined) return undefined;
    try {
        return parseEntityFilter(value);
    } catch (error) {
        if (!(error instanceof FilterParseError)) throw error;
        report('event.invalid', `filters did not parse: ${error.message}`);
        return undefined;
    }
};

const parseComponentGroups = (key: string, value: unknown, report: EventReport): readonly string[] => {
    if (!isRecord(value)) {
        report('event.invalid', `${key} must be an object with component_groups`);
        return [];
    }
    const groups = value.component_groups;
    if (!Array.isArray(groups)) {
        report('event.invalid', `${key}.component_groups must be an array`);
        return [];
    }
    return groups.filter((group): group is string => typeof group === 'string');
};

const parseSetProperty = (value: unknown, report: EventReport): readonly PropertyWrite[] => {
    if (!isRecord(value)) {
        report('event.invalid', 'set_property must be an object of property name to value');
        return [];
    }
    const writes: PropertyWrite[] = [];
    for (const [name, raw] of Object.entries(value)) {
        if (typeof raw === 'number' || typeof raw === 'boolean') {
            writes.push({ name, value: { kind: 'literal', value: raw } });
        } else if (typeof raw === 'string') {
            writes.push({ name, value: { kind: 'text', text: raw } });
        } else {
            report('event.invalid', `set_property ${name} must be a literal or an expression`);
        }
    }
    return writes;
};

const parseTriggers = (value: unknown, report: EventReport): readonly EventTrigger[] => {
    const entries: EventTrigger[] = [];
    for (const entry of asArray(value)) {
        if (typeof entry === 'string') {
            entries.push({ event: entry, target: 'self' });
            continue;
        }
        if (!isRecord(entry) || typeof entry.event !== 'string') {
            report('event.invalid', 'trigger must be an event name or an object with an event name');
            continue;
        }
        entries.push({
            event: entry.event,
            target: parseTarget(entry.target, report),
            filters: parseNodeFilter(entry.filters, report)
        });
    }
    return entries;
};

const parseTarget = (value: unknown, report: EventReport): EventTarget => {
    if (value === undefined) return 'self';
    const target = EVENT_TARGETS.find((name) => name === value);
    if (target !== undefined) return target;
    report('event.invalid', `unknown trigger target ${JSON.stringify(value)}`);
    return 'self';
};

const parseChildren = (key: string, value: unknown, report: EventReport): readonly EventNode[] => {
    if (!Array.isArray(value)) {
        report('event.invalid', `${key} must be an array of event nodes`);
        return [];
    }
    return value.map((child) => parseEventNode(child, report));
};

const parseRandomize = (value: unknown, report: EventReport): readonly WeightedEventNode[] => {
    if (!Array.isArray(value)) {
        report('event.invalid', 'randomize must be an array of weighted event nodes');
        return [];
    }
    return value.map((child) => ({
        weight: isRecord(child) && typeof child.weight === 'number' ? child.weight : 1,
        node: parseEventNode(child, report)
    }));
};

/** Whether a node asks for nothing at all, which is how vanilla writes a "do nothing" branch. */
export const isEmptyEventNode = (node: EventNode): boolean =>
    node.add.length === 0 &&
    node.remove.length === 0 &&
    node.setProperties.length === 0 &&
    node.triggers.length === 0 &&
    node.sequence.length === 0 &&
    node.randomize.length === 0 &&
    node.firstValid.length === 0 &&
    node.actions.length === 0;

/** Every action key a node tree asks for, which is what the coverage report counts. */
export const eventActionNames = (node: EventNode): readonly string[] => {
    const names: string[] = [];
    const walk = (current: EventNode): void => {
        for (const action of current.actions) names.push(action.name);
        for (const child of current.sequence) walk(child);
        for (const child of current.randomize) walk(child.node);
        for (const child of current.firstValid) walk(child);
    };
    walk(node);
    return names;
};
