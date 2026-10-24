import { namespaced } from './json';
import type { ParseContext } from './parse';

/**
 * The eight registries 26.3 made composable: a field of one of these types
 * takes an inline value, a namespaced id, a list, or a `#tag`.
 */
export const ELEMENT_REGISTRIES = [
    'advancement',
    'item_modifier',
    'loot_table',
    'context_int_provider',
    'context_float_provider',
    'predicate',
    'recipe',
    'slot_source'
] as const;

/** One of {@link ELEMENT_REGISTRIES}. */
export type ElementRegistry = (typeof ELEMENT_REGISTRIES)[number];

/**
 * Registries this package only ever reads tags from. A field like an item
 * predicate's `items` names members, not elements, so a `#tag` there expands
 * into identifiers rather than JSON.
 */
export const ID_REGISTRIES = [
    'item',
    'block',
    'entity_type',
    'enchantment',
    'fluid',
    'damage_type',
    'mob_effect',
    'worldgen/biome',
    'worldgen/structure'
] as const;

/** One of {@link ID_REGISTRIES}. */
export type IdRegistry = (typeof ID_REGISTRIES)[number];

/** Any registry a reference can point into. */
export type ReferenceRegistry = ElementRegistry | IdRegistry;

/**
 * How the evaluator reaches the rest of the datapack. Both members are
 * optional so a host that only uses inline grammar needs no resolver at all;
 * a reference with nothing to resolve it reports an error.
 */
export interface ReferenceResolver {
    /** Returns the parsed JSON of a registry element, or undefined when the id is unknown. */
    element?(registry: ElementRegistry, id: string): unknown;
    /** Returns the namespaced member ids of a tag, or undefined when the tag is unknown. */
    tag?(registry: ReferenceRegistry, id: string): readonly string[] | undefined;
}

/** Whether a JSON string is a tag reference rather than an element id. */
export const isTagReference = (value: string): boolean => value.startsWith('#');

const expandTag = (
    reference: string,
    registry: ReferenceRegistry,
    context: ParseContext,
    report: boolean,
    depth: number
): readonly string[] => {
    const id = namespaced(reference.slice(1));
    const key = `#${registry}/${id}`;
    if (context.visiting.has(key)) {
        context.error(`tag reference ${reference} is cyclic`);
        return [];
    }
    if (depth > 32) {
        context.error(`tag reference ${reference} nests too deeply`);
        return [];
    }
    if (!context.resolver?.tag) {
        if (report) context.error(`cannot resolve ${reference}: the parse options carry no tag resolver`);
        return [];
    }

    const members = context.resolver.tag(registry, id);
    if (!members) {
        if (report) context.error(`unknown ${registry} tag ${reference}`);
        return [];
    }

    context.visiting.add(key);
    try {
        return members.flatMap((member) =>
            isTagReference(member) ? expandTag(member, registry, context, report, depth + 1) : [namespaced(member)]
        );
    } finally {
        context.visiting.delete(key);
    }
};

/**
 * What the member form of the composition rule names: the identifiers written
 * out directly or reached through a tag, and the tag names themselves.
 */
export interface MemberSet {
    readonly ids: ReadonlySet<string>;
    /** Namespaced tag names without the leading `#`, kept so a subject that carries its own tags still matches. */
    readonly tags: readonly string[];
}

/**
 * Resolves the member form of 26.3's composition rule: a single namespaced id,
 * a list of ids, or a `#tag`. Use it for fields that name registry members
 * rather than elements, such as an item predicate's `items`. A tag that no
 * resolver can expand is not an error, because the subject may know its own
 * tags.
 */
export const resolveMembers = (value: unknown, registry: ReferenceRegistry, context: ParseContext): MemberSet => {
    const ids = new Set<string>();
    const tags: string[] = [];

    const visit = (entry: unknown, at: ParseContext): void => {
        if (entry === undefined || entry === null) return;
        if (Array.isArray(entry)) {
            entry.forEach((nested, index) => visit(nested, at.at(index)));
            return;
        }
        if (typeof entry !== 'string') {
            at.error(`expected a ${registry} id, a list of ids or a tag`);
            return;
        }
        if (isTagReference(entry)) {
            tags.push(namespaced(entry.slice(1)));
            for (const id of expandTag(entry, registry, at, false, 0)) ids.add(id);
            return;
        }
        ids.add(namespaced(entry));
    };

    visit(value, context);
    return { ids, tags };
};

/**
 * Parses one field under 26.3's composition rule, which the plan calls the
 * clearest rule in the format: the value may be an inline object, a namespaced
 * id of a registry element, a list mixing both, or a `#tag` naming elements.
 * Every predicate, item modifier and provider field goes through here.
 *
 * @param parseInline - Compiles one inline value; called once per resolved element.
 * @returns One compiled value per element, in the order the composition names them.
 */
export const parseComposed = <T>(
    value: unknown,
    registry: ElementRegistry,
    context: ParseContext,
    parseInline: (value: unknown, context: ParseContext) => T | undefined
): T[] => {
    if (value === undefined || value === null) return [];

    if (Array.isArray(value)) {
        return value.flatMap((entry, index) => parseComposed(entry, registry, context.at(index), parseInline));
    }

    if (typeof value === 'string') {
        const ids = isTagReference(value) ? expandTag(value, registry, context, true, 0) : [namespaced(value)];
        return ids.flatMap((id) => {
            const key = `${registry}/${id}`;
            if (context.visiting.has(key)) {
                context.error(`${registry} reference ${id} is cyclic`);
                return [];
            }
            if (!context.resolver?.element) {
                context.error(`cannot resolve ${id}: the parse options carry no element resolver`);
                return [];
            }

            const element = context.resolver.element(registry, id);
            if (element === undefined) {
                context.error(`unknown ${registry} ${id}`);
                return [];
            }

            context.visiting.add(key);
            try {
                const parsed = parseInline(element, context.atReference(id));
                return parsed === undefined ? [] : [parsed];
            } finally {
                context.visiting.delete(key);
            }
        });
    }

    const parsed = parseInline(value, context);
    return parsed === undefined ? [] : [parsed];
};

/**
 * The single-element form of {@link parseComposed}. Reports when a field that
 * takes one element is given several.
 */
export const parseComposedOne = <T>(
    value: unknown,
    registry: ElementRegistry,
    context: ParseContext,
    parseInline: (value: unknown, context: ParseContext) => T | undefined
): T | undefined => {
    const parsed = parseComposed(value, registry, context, parseInline);
    if (parsed.length > 1) {
        context.error(`expected one ${registry} but the composition resolved to ${parsed.length}`);
    }
    return parsed[0];
};
