import type { ComponentFactory, ParseResult } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import type { Filter } from '@jsprismarine/packs';

import type { EntityHooks } from '../hooks';
import { parseEventTarget } from '../events';
import type { EventTarget } from '../events';
import { asList, isRecord, parseFilterValue, stringAt } from './schemas';

/** One event a nameable entity raises when a name tag assigns a matching name. */
export interface NameableTrigger {
    /** The event name. */
    readonly event: string;
    /** The entity subject that receives the event. */
    readonly target: EventTarget;
    /** The filter that must pass before the event is raised. */
    readonly filters?: Filter;
}

/** What `minecraft:nameable` declares. */
export interface NameableParams {
    /** Whether a name tag may change the custom name; defaults to true. */
    readonly allowNameTagRenaming: boolean;
    /** Whether the client always displays the custom name; defaults to false. */
    readonly alwaysShow: boolean;
    /** The event raised whenever a name tag names the entity. */
    readonly defaultTrigger?: NameableTrigger;
    /** Name-specific events raised when the assigned name matches. */
    readonly nameActions: readonly {
        /** The exact custom name that selects this action. */
        readonly nameFilter: string;
        /** The event raised for the matching name. */
        readonly onNamed?: NameableTrigger;
    }[];
}

/** Whether a parsed component value has the shape `minecraft:nameable` exposes to its host. */
export const isNameableParams = (value: unknown): value is NameableParams =>
    isRecord(value) &&
    typeof value.allowNameTagRenaming === 'boolean' &&
    typeof value.alwaysShow === 'boolean' &&
    Array.isArray(value.nameActions);

/** Parses the event trigger a nameable component may carry. */
const triggerOf = (value: unknown, label: string): ParseResult<NameableTrigger | undefined> => {
    if (value === undefined) return accepted(undefined);
    if (typeof value === 'string') return accepted({ event: value, target: 'self' });
    if (!isRecord(value)) return rejected(`${label} must be an event name or trigger object`);

    const event = stringAt(value, 'event');
    if (event === undefined) return rejected(`${label}.event must be a string`);

    let filters: Filter | undefined;
    if (value.filters !== undefined) {
        const parsed = parseFilterValue(value.filters, label);
        if (!parsed.ok) return parsed;
        filters = parsed.value;
    }

    return accepted({
        event,
        target: parseEventTarget(value.target, () => undefined),
        ...(filters === undefined ? {} : { filters })
    });
};

/** `minecraft:nameable`, including the event raised when a name tag is used. */
export const nameable: ComponentFactory<EntityHooks, NameableParams> = {
    name: 'minecraft:nameable',
    hooks: [],
    schema: (value) => {
        if (!isRecord(value)) return rejected('expected an object');
        if (value.allow_name_tag_renaming !== undefined && typeof value.allow_name_tag_renaming !== 'boolean')
            return rejected('allow_name_tag_renaming must be a boolean');
        if (value.always_show !== undefined && typeof value.always_show !== 'boolean')
            return rejected('always_show must be a boolean');

        const defaultTrigger = triggerOf(value.default_trigger, 'default_trigger');
        if (!defaultTrigger.ok) return defaultTrigger;

        const nameActions: NameableParams['nameActions'][number][] = [];
        for (const [index, raw] of asList(value.name_actions).entries()) {
            if (!isRecord(raw)) return rejected(`name_actions[${index}] must be an object`);
            const nameFilter = stringAt(raw, 'name_filter');
            if (nameFilter === undefined) return rejected(`name_actions[${index}].name_filter must be a string`);

            const onNamed = triggerOf(raw.on_named, `name_actions[${index}].on_named`);
            if (!onNamed.ok) return onNamed;
            nameActions.push({
                nameFilter,
                ...(onNamed.value === undefined ? {} : { onNamed: onNamed.value })
            });
        }

        return accepted({
            allowNameTagRenaming: value.allow_name_tag_renaming !== false,
            alwaysShow: value.always_show === true,
            ...(defaultTrigger.value === undefined ? {} : { defaultTrigger: defaultTrigger.value }),
            nameActions
        });
    },
    create: () => ({})
};
