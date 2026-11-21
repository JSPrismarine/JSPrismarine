/**
 * The reviewed entries of the Java registries this package reads that it has no handler for.
 * `unhandledJavaTypes.test.ts` checks each list against the pinned Java registry report, and
 * fails when an entry gains a handler or leaves the report, so a list only shrinks.
 *
 * A listed sub-predicate type still parses: the predicate warns that it is not implemented and
 * evaluates false.
 */

/** `minecraft:loot_condition_type` entries with no condition. */
export const UNHANDLED_LOOT_CONDITION_TYPE: readonly string[] = [];

/** `minecraft:loot_function_type` entries with no modifier. */
export const UNHANDLED_LOOT_FUNCTION_TYPE: readonly string[] = [];

/** `minecraft:data_component_predicate_type` entries with no built-in predicate. */
export const UNHANDLED_DATA_COMPONENT_PREDICATE_TYPE: readonly string[] = [
    // Needs the attribute modifier component's entries matched by attribute, id, amount and slot.
    'minecraft:attribute_modifiers',
    // Needs the bundle's item list matched against a collection predicate.
    'minecraft:bundle_contents',
    // Needs the container's slots matched against a collection predicate.
    'minecraft:container',
    // Needs an NBT subset match over the item's custom data.
    'minecraft:custom_data',
    // Needs the firework star's shape, colors, trail and twinkle compared.
    'minecraft:firework_explosion',
    // Needs the rocket's flight duration and explosion list compared.
    'minecraft:fireworks',
    // Needs the potion id and custom effects compared.
    'minecraft:potion_contents',
    // Needs the armor trim's material and pattern compared.
    'minecraft:trim',
    // Needs the book's pages matched against a collection predicate.
    'minecraft:writable_book_content',
    // Needs the signed book's author, title, generation and pages compared.
    'minecraft:written_book_content'
];

/** `minecraft:entity_sub_predicate_type` entries with no built-in predicate. */
export const UNHANDLED_ENTITY_SUB_PREDICATE_TYPE: readonly string[] = [
    // Needs the entity's saved NBT, which the entity view does not expose.
    'minecraft:nbt',
    // Needs the entity's inventory slots, which the entity view does not expose.
    'minecraft:slots'
];
