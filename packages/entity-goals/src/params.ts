import type { ComponentSchema } from '@jsprismarine/content';
import { accepted, rejected } from '@jsprismarine/content';
import { TICKS_PER_SECOND, parseEntityFilter } from '@jsprismarine/entities';
import type { Filter } from '@jsprismarine/packs';

/**
 * The parameter shapes the 170 goal bodies are written in.
 *
 * Every reader here answers a key the generated inventory actually records,
 * and the awkward ones are awkward because vanilla is: `attack_interval` is a
 * number in some files and a `{min, max}` object in others, `sound_interval`
 * is an object in some and a two-member array in others, and several duration
 * keys are seconds while their neighbors are ticks.
 */

/** A JSON object, which is what every goal body is. */
export type GoalBody = Record<string, unknown>;

/** Whether a value is a plain JSON object. */
export const isRecord = (value: unknown): value is GoalBody =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** Builds a goal schema from a reader over the body, rejecting anything that is not an object. */
export const bodySchema =
    <P>(read: (body: GoalBody) => P): ComponentSchema<P> =>
    (value) =>
        isRecord(value) ? accepted(read(value)) : rejected('expected an object');

/** Reads a number, falling back when the key is absent or not a number. */
export const numberAt = (body: GoalBody, key: string, fallback: number): number =>
    typeof body[key] === 'number' ? body[key] : fallback;

/** Reads a boolean, falling back when the key is absent. */
export const booleanAt = (body: GoalBody, key: string, fallback: boolean): boolean =>
    typeof body[key] === 'boolean' ? body[key] : fallback;

/** Reads a string, or undefined when the key is absent. */
export const stringAt = (body: GoalBody, key: string): string | undefined =>
    typeof body[key] === 'string' ? body[key] : undefined;

/** Reads a duration written in seconds and returns it in server ticks. */
export const ticksAt = (body: GoalBody, key: string, fallbackSeconds: number): number =>
    Math.max(0, Math.round(numberAt(body, key, fallbackSeconds) * TICKS_PER_SECOND));

/** A `[minimum, maximum]` pair, which is how vanilla writes most of the ranges. */
export type Range = readonly [number, number];

/**
 * Reads a range.
 *
 * Vanilla writes one three ways: a bare number standing for both ends, a
 * two-member array, and an object with `min` and `max` or `range_min` and
 * `range_max`. All three appear among the goal bodies, sometimes under the
 * same key in different files.
 */
export const rangeAt = (body: GoalBody, key: string, fallback: Range): Range => {
    const value = body[key];
    if (typeof value === 'number') return [value, value];
    if (Array.isArray(value)) {
        const numbers = value.filter((member) => typeof member === 'number');
        return [numbers[0] ?? fallback[0], numbers[1] ?? numbers[0] ?? fallback[1]];
    }
    if (isRecord(value)) {
        const min = numberAt(value, 'min', numberAt(value, 'range_min', fallback[0]));
        return [min, numberAt(value, 'max', numberAt(value, 'range_max', Math.max(min, fallback[1])))];
    }
    return fallback;
};

/** Reads a range written in seconds and returns both ends in server ticks. */
export const tickRangeAt = (body: GoalBody, key: string, fallbackSeconds: Range): Range => {
    const [min, max] = rangeAt(body, key, fallbackSeconds);
    return [Math.max(0, Math.round(min * TICKS_PER_SECOND)), Math.max(0, Math.round(max * TICKS_PER_SECOND))];
};

/** Reads a list of strings from a key vanilla writes as one name or as a list of names. */
export const stringsAt = (body: GoalBody, key: string): readonly string[] => {
    const value = body[key];
    const members = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return members
        .map((member) => {
            if (typeof member === 'string') return member;
            if (isRecord(member) && typeof member.item === 'string') return member.item;
            if (isRecord(member) && typeof member.name === 'string') return member.name;
            return undefined;
        })
        .filter((member) => member !== undefined);
};

/** Reads the members of a list, dropping anything that is not an object. */
export const recordsAt = (body: GoalBody, key: string): readonly GoalBody[] => {
    const value = body[key];
    const members = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return members.filter(isRecord);
};

/** An event a goal fires at one of its moments, such as `on_attack` or `on_tempt_end`. */
export interface GoalEvent {
    /** The event name to fire. */
    readonly event: string;
    /** Who to fire it on; `self` unless the body says otherwise. */
    readonly target: string;
    /** The filters that gate it, when the body carries any. */
    readonly filters?: Filter;
}

/** Reads one `{event, target, filters}` value, which vanilla also writes as a bare event name. */
export const eventOf = (value: unknown): GoalEvent | undefined => {
    if (typeof value === 'string') return { event: value, target: 'self' };
    if (!isRecord(value)) return undefined;
    const event = stringAt(value, 'event');
    if (event === undefined) return undefined;
    return { event, target: stringAt(value, 'target') ?? 'self', filters: filterOf(value.filters) };
};

/** Reads an event hook under a key, which is what `on_attack` and its siblings are. */
export const eventAt = (body: GoalBody, key: string): GoalEvent | undefined => eventOf(body[key]);

/** Reads a list of event hooks, which `on_item_throw` and `on_reach` write as arrays. */
export const eventsAt = (body: GoalBody, key: string): readonly GoalEvent[] => {
    const value = body[key];
    const members = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return members.map(eventOf).filter((member) => member !== undefined);
};

/** Parses a filter value, or returns undefined when the key is absent or the grammar rejects it. */
export const filterOf = (value: unknown): Filter | undefined => {
    if (value === undefined) return undefined;
    try {
        return parseEntityFilter(value);
    } catch {
        return undefined;
    }
};

/** Reads a filter under a key. */
export const filterAt = (body: GoalBody, key: string): Filter | undefined => filterOf(body[key]);

/**
 * One entry of the `entity_types` nested table the targeting goals share.
 *
 * The table is documented at `Definitions/NestedTables/entity_types.md`, and
 * `nearest_attackable_target`, `hurt_by_target`, `avoid_mob_type`,
 * `share_items`, `defend_village_target` and seven more all take it.
 */
export interface TargetEntityType {
    /** Which entities the entry matches, evaluated with the candidate as `other`. */
    readonly filters: Filter | undefined;
    /** How far the entry reaches, in blocks. */
    readonly maxDistance: number;
    /** Whether the entity has to see the candidate. */
    readonly mustSee: boolean;
    /** How long a seen candidate stays valid out of sight, in ticks. */
    readonly mustSeeForgetDuration: number;
    readonly walkSpeedMultiplier: number;
    readonly sprintSpeedMultiplier: number;
    /** How long the entry waits between attempts, in ticks. */
    readonly cooldown: number;
}

/** Reads one `entity_types` entry over the documented defaults. */
const targetEntityType = (body: GoalBody): TargetEntityType => ({
    filters: filterAt(body, 'filters'),
    maxDistance: numberAt(body, 'max_dist', 16),
    mustSee: booleanAt(body, 'must_see', false),
    mustSeeForgetDuration: ticksAt(body, 'must_see_forget_duration', 3),
    walkSpeedMultiplier: numberAt(body, 'walk_speed_multiplier', 1),
    sprintSpeedMultiplier: numberAt(body, 'sprint_speed_multiplier', 1),
    cooldown: ticksAt(body, 'cooldown', 0)
});

/** Reads the `entity_types` table, which vanilla writes as one entry or as a list. */
export const entityTypesAt = (body: GoalBody, key = 'entity_types'): readonly TargetEntityType[] =>
    recordsAt(body, key).map(targetEntityType);

/** Accepts any object body, for a goal whose behavior takes no parameters. */
export const emptyBody: ComponentSchema<GoalBody> = (value) =>
    isRecord(value) ? accepted(value) : rejected('expected an object');
