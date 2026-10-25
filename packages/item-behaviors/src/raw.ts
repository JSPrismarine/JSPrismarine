/**
 * Reading raw component JSON.
 *
 * Most of what a behavior needs is already parsed: the item package's schemas
 * keep every field of `minecraft:tool`, `minecraft:equippable` and the rest.
 * Two shapes are deliberately not kept. `minecraft:consumable`'s
 * `on_consume_effects` and `minecraft:death_protection`'s `death_effects`
 * parse only the discriminator, because the item package decided the five
 * effect types belong to whoever runs them, which is this package.
 *
 * So the consumable behaviors read the definition's own JSON, which
 * `BindContext` hands them at load, and parse it once per item type. These are
 * the accessors for that: narrow, total, and undefined rather than throwing on
 * a shape they do not recognize.
 */

/** The value at one key of a JSON object, or undefined when there is no object or no key. */
export const fieldOf = (value: unknown, key: string): unknown => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    return Object.entries(value).find(([name]) => name === key)?.[1];
};

/** The value at one key, when it is a number. */
export const numberField = (value: unknown, key: string): number | undefined => {
    const field = fieldOf(value, key);
    return typeof field === 'number' && Number.isFinite(field) ? field : undefined;
};

/** The value at one key, when it is a string. */
export const stringField = (value: unknown, key: string): string | undefined => {
    const field = fieldOf(value, key);
    return typeof field === 'string' ? field : undefined;
};

/** The value at one key, when it is a boolean. */
export const booleanField = (value: unknown, key: string): boolean | undefined => {
    const field = fieldOf(value, key);
    return typeof field === 'boolean' ? field : undefined;
};

/**
 * The value at one key as a list.
 *
 * Java writes several of these fields as either one object or a list of them,
 * so a lone object comes back as a one-element list.
 */
export const listField = (value: unknown, key: string): readonly unknown[] => {
    const field = fieldOf(value, key);
    if (field === undefined) return [];
    return Array.isArray(field) ? field : [field];
};
