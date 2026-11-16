/**
 * Rewrites one component of an entity file in the shape a behavior pack writes, wherever the
 * file declares it: in its base components and in each component group.
 */
import { isRecord } from '../utils/isRecord';

/** The identifier an entity file declares, or undefined for a file that is not an entity's. */
export const entityFileIdentifier = (data: unknown): string | undefined => {
    const entity = isRecord(data) ? data['minecraft:entity'] : undefined;
    const description = isRecord(entity) ? entity['description'] : undefined;
    const identifier = isRecord(description) ? description['identifier'] : undefined;
    return typeof identifier === 'string' ? identifier : undefined;
};

/**
 * Applies `rewrite` to every body of `component` the file declares.
 *
 * @param data - The parsed JSON of an entity file.
 * @param component - The component to rewrite, such as `minecraft:breedable`.
 * @param rewrite - Builds the replacement body from the declared one and the component group
 *   that declares it, undefined for the base components.
 * @returns The same object when the file declares no such component; otherwise a copy with
 *   each body replaced.
 */
export const withComponentRewritten = (
    data: unknown,
    component: string,
    rewrite: (body: Record<string, unknown>, group: string | undefined) => Record<string, unknown>
): unknown => withComponentReplaced(data, component, (body, group) => ({ [component]: rewrite(body, group) }));

/**
 * Replaces every body of `component` the file declares with the components `replace` builds
 * from it, in its base components and in each component group. An empty result removes the
 * component; a result under another name swaps it for that component.
 *
 * @param data - The parsed JSON of an entity file.
 * @param component - The component to replace, such as `minecraft:behavior.swell`.
 * @param replace - Builds the components that take the declared body's place, from the body and
 *   the component group that declares it, undefined for the base components.
 * @returns The same object when the file declares no such component; otherwise a copy with
 *   each body replaced.
 */
export const withComponentReplaced = (
    data: unknown,
    component: string,
    replace: (
        body: Record<string, unknown>,
        group: string | undefined
    ) => Readonly<Record<string, Record<string, unknown>>>
): unknown => {
    if (!isRecord(data)) return data;
    const entity = data['minecraft:entity'];
    if (!isRecord(entity)) return data;
    const components = entity['components'];
    const groups = entity['component_groups'];
    const declares =
        (isRecord(components) && isRecord(components[component])) ||
        (isRecord(groups) && Object.values(groups).some((group) => isRecord(group) && isRecord(group[component])));
    if (!declares) return data;

    const replaced = (map: unknown, group: string | undefined): unknown => {
        if (!isRecord(map)) return map;
        const body = map[component];
        if (!isRecord(body)) return map;
        // In place, so the components keep the order the file wrote them in.
        return Object.fromEntries(
            Object.entries(map).flatMap(([name, value]) =>
                name === component ? Object.entries(replace(body, group)) : [[name, value] as const]
            )
        );
    };
    return {
        ...data,
        'minecraft:entity': {
            ...entity,
            ...(components === undefined ? {} : { components: replaced(components, undefined) }),
            ...(isRecord(groups)
                ? {
                      component_groups: Object.fromEntries(
                          Object.entries(groups).map(([name, group]) => [name, replaced(group, name)])
                      )
                  }
                : {})
        }
    };
};

/**
 * Takes every body of `components` off an entity file, in its base components and each component
 * group.
 *
 * @param data - The parsed JSON of an entity file.
 * @param remove - Whether a component is one to take off.
 * @returns The same object when the file declares none of them; otherwise a copy without them.
 */
export const withoutComponents = (data: unknown, remove: (component: string) => boolean): unknown => {
    if (!isRecord(data)) return data;
    const entity = data['minecraft:entity'];
    if (!isRecord(entity)) return data;
    const components = entity['components'];
    const groups = entity['component_groups'];
    const declares = (map: unknown): boolean => isRecord(map) && Object.keys(map).some(remove);
    if (!declares(components) && !(isRecord(groups) && Object.values(groups).some(declares))) return data;

    const kept = (map: unknown): unknown =>
        isRecord(map) ? Object.fromEntries(Object.entries(map).filter(([name]) => !remove(name))) : map;
    return {
        ...data,
        'minecraft:entity': {
            ...entity,
            ...(components === undefined ? {} : { components: kept(components) }),
            ...(isRecord(groups)
                ? {
                      component_groups: Object.fromEntries(
                          Object.entries(groups).map(([name, group]) => [name, kept(group)])
                      )
                  }
                : {})
        }
    };
};

/**
 * Removes every body of `component` the file declares.
 *
 * @param data - The parsed JSON of an entity file.
 * @param component - The component to remove, such as `minecraft:spawn_egg_interaction`.
 * @returns The same object when the file declares no such component; otherwise a copy without it.
 */
export const withoutComponent = (data: unknown, component: string): unknown =>
    withoutComponents(data, (name) => name === component);
