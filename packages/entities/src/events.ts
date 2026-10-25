import type { Filter } from '@jsprismarine/packs';
import { FilterParseError, parseFilter } from '@jsprismarine/packs';

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

/** The three vibration names `emit_vibration` accepts. */
export const VIBRATION_KINDS = ['entity_interact', 'entity_act', 'entity_die'] as const;

/** One of {@link VIBRATION_KINDS}. */
export type VibrationKind = (typeof VIBRATION_KINDS)[number];

/**
 * One event action, parsed into the shape {@link EntityInstance.perform}
 * carries out.
 *
 * The nine members are every action the composed vanilla pack writes plus
 * `queue_command`, which the documentation describes and no vanilla entity
 * uses. Measured over the 129 files of Bedrock Dedicated Server 1.26.51.1:
 * `play_sound` 23 uses, `set_home_position` 17, `emit_vibration` 9,
 * `drop_item` 2, `execute_event_on_home_block` 2, and one each of
 * `emit_particle`, `reset_target` and `stop_movement`.
 */
export type EntityAction =
    | { readonly name: 'play_sound'; readonly sound: string }
    | { readonly name: 'emit_particle'; readonly particle: string }
    | { readonly name: 'emit_vibration'; readonly vibration: VibrationKind }
    /** Vanilla writes one command string; the engine also accepts a list. */
    | { readonly name: 'queue_command'; readonly commands: readonly string[]; readonly target: EventTarget }
    | { readonly name: 'set_home_position' }
    | { readonly name: 'execute_event_on_home_block'; readonly event: string }
    /** The slot name, such as `slot.weapon.mainhand`. */
    | { readonly name: 'drop_item'; readonly slot: string }
    | { readonly name: 'stop_movement'; readonly horizontal: boolean; readonly vertical: boolean }
    | { readonly name: 'reset_target' };

/**
 * An action a node asks for, with the key the file writes and the body
 * unchanged.
 *
 * {@link EventAction.parsed} is the understood form. It is undefined for a key
 * this package does not carry out, which is what makes an unimplemented action
 * a reported line rather than silence.
 */
export interface EventAction {
    /** The action key as the file writes it, such as `play_sound`. */
    readonly name: string;
    readonly value: unknown;
    /** The parsed action, or undefined when this package does not carry the key out. */
    readonly parsed?: EntityAction;
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
                actions.push({ name: key, value: body, parsed: parseEntityAction(key, body, report) });
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

const textAt = (body: unknown, key: string): string | undefined => {
    if (!isRecord(body)) return undefined;
    const value = body[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const flagAt = (body: unknown, key: string, fallback: boolean): boolean =>
    isRecord(body) && typeof body[key] === 'boolean' ? body[key] : fallback;

/**
 * Parses one event action body into the form the entity carries out.
 *
 * An action the package implements whose body is unusable, such as a
 * `play_sound` with no `sound`, is reported and left unparsed, so it reaches
 * the same report as an action the package does not implement at all.
 *
 * @returns The parsed action, or undefined when the key is not one of the nine
 *   {@link EntityAction} covers or its body cannot be read.
 */
export const parseEntityAction = (key: string, body: unknown, report: EventReport): EntityAction | undefined => {
    switch (key) {
        case 'play_sound': {
            const sound = textAt(body, 'sound');
            if (sound === undefined) return missing(key, 'sound', report);
            return { name: 'play_sound', sound };
        }
        case 'emit_particle': {
            const particle = textAt(body, 'particle');
            if (particle === undefined) return missing(key, 'particle', report);
            return { name: 'emit_particle', particle };
        }
        case 'emit_vibration': {
            const named = textAt(body, 'vibration');
            const vibration = VIBRATION_KINDS.find((kind) => kind === named);
            if (vibration === undefined) {
                report('event.invalid', `emit_vibration names ${JSON.stringify(named)}, which is not a vibration`);
                return undefined;
            }
            return { name: 'emit_vibration', vibration };
        }
        case 'queue_command': {
            const commands = asArray(isRecord(body) ? body.command : undefined).filter(
                (command): command is string => typeof command === 'string'
            );
            if (commands.length === 0) return missing(key, 'command', report);
            return { name: 'queue_command', commands, target: parseEventTarget(bodyTarget(body), report) };
        }
        case 'set_home_position':
            return { name: 'set_home_position' };
        case 'execute_event_on_home_block': {
            const event = textAt(body, 'event');
            if (event === undefined) return missing(key, 'event', report);
            return { name: 'execute_event_on_home_block', event };
        }
        case 'drop_item': {
            const slot = textAt(body, 'slot');
            if (slot === undefined) return missing(key, 'slot', report);
            return { name: 'drop_item', slot };
        }
        case 'stop_movement':
            return {
                name: 'stop_movement',
                horizontal: flagAt(body, 'stop_horizontal_movement', true),
                vertical: flagAt(body, 'stop_vertical_movement', true)
            };
        case 'reset_target':
            return { name: 'reset_target' };
        default:
            return undefined;
    }
};

/** The `target` of an action body, left undefined so the target parser defaults it to `self`. */
const bodyTarget = (body: unknown): unknown => (isRecord(body) ? body.target : undefined);

const missing = (key: string, field: string, report: EventReport): undefined => {
    report('event.invalid', `${key} needs a ${field}`);
    return undefined;
};

const parseNodeFilter = (value: unknown, report: EventReport): Filter | undefined => {
    if (value === undefined) return undefined;
    try {
        return parseFilter(value);
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
    // A `randomize` branch that changes nothing is written `"remove": {}` in
    // the vanilla pack, so an absent `component_groups` is the empty list it
    // means. A `component_groups` that is there and is not a list is wrong.
    if (groups === undefined) return [];
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
            target: parseEventTarget(entry.target, report),
            filters: parseNodeFilter(entry.filters, report)
        });
    }
    return entries;
};

/**
 * Reads a `target` key, which every shape that names one spells the same way.
 *
 * @returns The named target, or `self` when the key is absent or unknown.
 */
export const parseEventTarget = (value: unknown, report: EventReport): EventTarget => {
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

/** Every action a node tree asks for, however deeply nested, in tree order. */
export const eventActions = (node: EventNode): readonly EventAction[] => {
    const found: EventAction[] = [];
    const walk = (current: EventNode): void => {
        found.push(...current.actions);
        for (const child of current.sequence) walk(child);
        for (const child of current.randomize) walk(child.node);
        for (const child of current.firstValid) walk(child);
    };
    walk(node);
    return found;
};

/** Every action key a node tree asks for, which is what the version gate checks. */
export const eventActionNames = (node: EventNode): readonly string[] => eventActions(node).map((action) => action.name);
