import {
    asBoolean,
    asList,
    asNumber,
    asString,
    isJsonObject,
    member,
    namespaced,
    resolveMembers,
    rootContext
} from '@jsprismarine/predicates';
import type { ParseContext, ParseOptions, ParseResult } from '@jsprismarine/predicates';

import type { EvaluationServices } from './events';
import { criterionKeys, isTriggerName, parseTrigger } from './triggers';
import type { AnyTriggerEvent, TriggerName } from './triggers';

/** The three icon frames `AdvancementType` registers, which decide the toast wording and title color. */
export const ADVANCEMENT_FRAMES = ['task', 'challenge', 'goal'] as const;

/** One of {@link ADVANCEMENT_FRAMES}. */
export type AdvancementFrame = (typeof ADVANCEMENT_FRAMES)[number];

/** The stack template an advancement draws as its icon. */
export interface AdvancementIcon {
    /** Namespaced item identifier. */
    readonly id: string;
    readonly count: number;
    /** Data components as parsed JSON, because only the client reads them. */
    readonly components?: unknown;
}

/** What a client draws for an advancement in the tab and in the toast. */
export interface AdvancementDisplay {
    readonly icon: AdvancementIcon;
    /** Chat component JSON; turning it into text belongs to the text package, not here. */
    readonly title: unknown;
    readonly description: unknown;
    /** Background texture of a root advancement's tab, absent on every non-root. */
    readonly background?: string;
    readonly frame: AdvancementFrame;
    readonly showToast: boolean;
    readonly announceToChat: boolean;
    readonly hidden: boolean;
}

/** What completing an advancement hands the player. */
export interface AdvancementRewards {
    readonly experience: number;
    /** Namespaced loot table identifiers, with any `#tag` already expanded. */
    readonly lootTables: readonly string[];
    /** Namespaced recipe identifiers to unlock. */
    readonly recipes: readonly string[];
    /** Namespaced identifier of an mcfunction to run. */
    readonly function?: string;
}

/**
 * One compiled criterion. `test` declares the union of every event shape
 * because compiling erases which trigger produced it; the engine only ever
 * calls it with the event its own trigger declares, and method syntax is what
 * makes that assignment typecheck.
 */
export interface CompiledCriterion {
    readonly name: string;
    readonly trigger: TriggerName;
    /**
     * Registry ids this criterion can match, for the triggers `KEYED_TRIGGERS`
     * covers. The engine indexes by them instead of putting the criterion in
     * its trigger's linear bucket.
     */
    readonly keys?: readonly string[];
    test(event: AnyTriggerEvent, services: EvaluationServices): boolean;
}

/** One advancement file, parsed once and compiled. */
export interface ParsedAdvancement {
    /** Namespaced identifier, which is the file path under `data/<namespace>/advancement/`. */
    readonly id: string;
    /** Namespaced identifier of the parent, absent on a root. */
    readonly parent?: string;
    readonly display?: AdvancementDisplay;
    readonly rewards: AdvancementRewards;
    readonly criteria: ReadonlyMap<string, CompiledCriterion>;
    /**
     * Conjunctive normal form over the criterion names: the advancement
     * completes when every group has at least one completed criterion. An
     * absent `requirements` becomes one single-name group per criterion, which
     * is Java's `AdvancementRequirements.allOf`.
     */
    readonly requirements: readonly (readonly string[])[];
    readonly sendsTelemetryEvent: boolean;
}

const EMPTY_REWARDS: AdvancementRewards = { experience: 0, lootTables: [], recipes: [] };

const isFrame = (value: string): value is AdvancementFrame => ADVANCEMENT_FRAMES.some((known) => known === value);

const parseIcon = (value: unknown, context: ParseContext): AdvancementIcon | undefined => {
    const id = asString(member(value, 'id'));
    if (id === undefined) {
        context.error('an advancement icon needs an item id');
        return undefined;
    }
    return {
        id: namespaced(id),
        count: asNumber(member(value, 'count')) ?? 1,
        components: member(value, 'components')
    };
};

const parseDisplay = (value: unknown, context: ParseContext): AdvancementDisplay | undefined => {
    if (!isJsonObject(value)) {
        context.error('the display of an advancement must be an object');
        return undefined;
    }

    const icon = parseIcon(value['icon'], context.at('icon'));
    if (!icon) return undefined;

    const title = value['title'];
    const description = value['description'];
    if (title === undefined) context.at('title').error('an advancement display needs a title');
    if (description === undefined) context.at('description').error('an advancement display needs a description');

    const declared = asString(value['frame']);
    if (declared !== undefined && !isFrame(declared)) {
        context.at('frame').error(`unknown advancement frame ${declared}`);
    }

    return {
        icon,
        title,
        description,
        background: asString(value['background']),
        frame: declared !== undefined && isFrame(declared) ? declared : 'task',
        showToast: asBoolean(value['show_toast']) ?? true,
        announceToChat: asBoolean(value['announce_to_chat']) ?? true,
        hidden: asBoolean(value['hidden']) ?? false
    };
};

const parseRewards = (value: unknown, context: ParseContext): AdvancementRewards => {
    if (value === undefined) return EMPTY_REWARDS;
    if (!isJsonObject(value)) {
        context.error('the rewards of an advancement must be an object');
        return EMPTY_REWARDS;
    }

    const recipes = asList(value['recipes']).flatMap((entry, index) => {
        const id = asString(entry);
        if (id === undefined) {
            context.at('recipes').at(index).error('a reward recipe must be a namespaced id');
            return [];
        }
        return [namespaced(id)];
    });

    const loot = 'loot' in value ? resolveMembers(value['loot'], 'loot_table', context.at('loot')) : undefined;
    const run = asString(value['function']);

    return {
        experience: asNumber(value['experience']) ?? 0,
        lootTables: loot ? [...loot.ids] : [],
        recipes,
        function: run === undefined ? undefined : namespaced(run)
    };
};

const parseRequirements = (
    value: unknown,
    criteria: ReadonlyMap<string, CompiledCriterion>,
    context: ParseContext
): readonly (readonly string[])[] => {
    if (value === undefined) return [...criteria.keys()].map((name) => [name]);
    if (!Array.isArray(value)) {
        context.error('the requirements of an advancement must be an array of arrays of criterion names');
        return [...criteria.keys()].map((name) => [name]);
    }

    const named = new Set<string>();
    const groups = value.map((group, index) => {
        const at = context.at(index);
        const names = asList(group).flatMap((entry, position) => {
            const name = asString(entry);
            if (name === undefined) {
                at.at(position).error('a requirement entry must be a criterion name');
                return [];
            }
            if (!criteria.has(name)) {
                at.at(position).error(`requirement ${name} names no criterion of this advancement`);
                return [];
            }
            named.add(name);
            return [name];
        });
        if (names.length === 0) at.error('a requirement group cannot be empty');
        return names;
    });

    for (const name of criteria.keys()) {
        if (!named.has(name)) context.error(`criterion ${name} appears in no requirement group`);
    }
    return groups;
};

const parseCriteria = (value: unknown, context: ParseContext): Map<string, CompiledCriterion> => {
    const criteria = new Map<string, CompiledCriterion>();
    if (!isJsonObject(value)) {
        context.error('the criteria of an advancement must be an object');
        return criteria;
    }

    for (const [name, criterion] of Object.entries(value)) {
        const at = context.at(name);
        const declared = asString(member(criterion, 'trigger'));
        if (declared === undefined) {
            at.at('trigger').error('a criterion needs a trigger');
            continue;
        }

        const trigger = namespaced(declared).slice('minecraft:'.length);
        if (!isTriggerName(trigger)) {
            at.at('trigger').error(`unknown trigger type ${declared}`);
            continue;
        }

        const conditions = member(criterion, 'conditions');
        const conditionsAt = at.at('conditions');
        criteria.set(name, {
            name,
            trigger,
            keys: criterionKeys(trigger, conditions, conditionsAt),
            test: parseTrigger(trigger, conditions, conditionsAt)
        });
    }

    if (criteria.size === 0) context.error('an advancement needs at least one criterion');
    return criteria;
};

/**
 * Parses one advancement file. Nothing throws: a fault lands in the
 * diagnostics and the value is undefined only when the file has no usable
 * criterion at all.
 *
 * @param id - Namespaced identifier the file is registered under.
 * @param options - Pass `resolver` so `#tag` references in `rewards.loot`,
 * `recipes` fields and nested loot conditions resolve, and `diagnostics` to
 * gather a whole datapack into one report.
 */
export const parseAdvancement = (
    id: string,
    json: unknown,
    options?: ParseOptions
): ParseResult<ParsedAdvancement | undefined> => {
    const context = rootContext({ ...options, path: options?.path ?? id });

    if (!isJsonObject(json)) {
        context.error('an advancement must be an object');
        return { value: undefined, diagnostics: context.diagnostics.entries };
    }

    const criteria = parseCriteria(json['criteria'], context.at('criteria'));
    if (criteria.size === 0) return { value: undefined, diagnostics: context.diagnostics.entries };

    const parent = asString(json['parent']);
    const value: ParsedAdvancement = {
        id: namespaced(id),
        parent: parent === undefined ? undefined : namespaced(parent),
        display: 'display' in json ? parseDisplay(json['display'], context.at('display')) : undefined,
        rewards: parseRewards(json['rewards'], context.at('rewards')),
        criteria,
        requirements: parseRequirements(json['requirements'], criteria, context.at('requirements')),
        sendsTelemetryEvent: asBoolean(json['sends_telemetry_event']) ?? false
    };

    return { value, diagnostics: context.diagnostics.entries };
};
