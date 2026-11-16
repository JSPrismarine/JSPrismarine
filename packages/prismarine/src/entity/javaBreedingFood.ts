/**
 * Java's breeding food, written into the `minecraft:breedable` of each entity file as it loads.
 *
 * Java's `Animal.isFood` reads one item tag per animal, such as `minecraft:bee_food`, and Bedrock's
 * pack lists the same foods by hand. The hand lists have drifted from the tags: a Bedrock bee takes
 * no open eyeblossom and a Bedrock wolf no fish. Which items breed an animal is decided by the
 * server and drawn by nothing on the client, so Java's tag decides. The overlay replaces the item
 * list of an animal that has a tag with the tag's members, keeping a Bedrock entry's `result_item`
 * where the item is in both, so an axolotl still hands back the empty water bucket.
 *
 * It also writes Bedrock's modern name for the items the pack still files under a name from before
 * the flattening, such as `appleEnchanted`, because the held item a player feeds with carries the
 * modern name and would never match the old one.
 */
import { legacy_item_aliases } from '@jsprismarine/bedrock-data';
import { javaEntityTypeToBedrock, javaItemToBedrock } from '@jsprismarine/mapping';

import type { ContentTags } from '../content/tags';
import { isRecord } from '../utils/isRecord';
import { entityFileIdentifier, withComponentRewritten } from './definitionOverlay';

/** The item tag each Java animal's `isFood` reads, by Java entity type. */
export const JAVA_BREEDING_FOOD_TAGS: Readonly<Record<string, string>> = {
    'minecraft:armadillo': 'minecraft:armadillo_food',
    'minecraft:axolotl': 'minecraft:axolotl_food',
    'minecraft:bee': 'minecraft:bee_food',
    'minecraft:camel': 'minecraft:camel_food',
    'minecraft:cat': 'minecraft:cat_food',
    'minecraft:chicken': 'minecraft:chicken_food',
    'minecraft:cow': 'minecraft:cow_food',
    // `MushroomCow` extends `AbstractCow`, which reads the cow's tag.
    'minecraft:mooshroom': 'minecraft:cow_food',
    'minecraft:fox': 'minecraft:fox_food',
    'minecraft:frog': 'minecraft:frog_food',
    'minecraft:goat': 'minecraft:goat_food',
    'minecraft:hoglin': 'minecraft:hoglin_food',
    'minecraft:nautilus': 'minecraft:nautilus_food',
    'minecraft:ocelot': 'minecraft:ocelot_food',
    'minecraft:panda': 'minecraft:panda_food',
    'minecraft:pig': 'minecraft:pig_food',
    'minecraft:rabbit': 'minecraft:rabbit_food',
    'minecraft:sheep': 'minecraft:sheep_food',
    'minecraft:sniffer': 'minecraft:sniffer_food',
    'minecraft:strider': 'minecraft:strider_food',
    'minecraft:turtle': 'minecraft:turtle_food',
    'minecraft:wolf': 'minecraft:wolf_food'
};

/** The Bedrock items Java items map to, each once, leaving out a Java item Bedrock has no counterpart for. */
export const bedrockItemsOf = (javaItems: Iterable<string>): readonly string[] => [
    ...new Set(
        [...javaItems].flatMap((javaItem) => {
            const item = javaItemToBedrock(javaItem);
            return item.kind === 'mapped' || item.kind === 'passthrough' ? [item.bedrock.identifier] : [];
        })
    )
];

/** The Bedrock items that breed each Bedrock entity, by Bedrock identifier. */
export type BreedingFoods = ReadonlyMap<string, readonly string[]>;

/**
 * Resolves {@link JAVA_BREEDING_FOOD_TAGS} against a tag set into Bedrock identifiers.
 *
 * An animal whose tag the stack does not define is left out, so its pack's own list stays.
 */
export const javaBreedingFoods = (tags: ContentTags): BreedingFoods => {
    const foods = new Map<string, readonly string[]>();
    for (const [javaEntity, tag] of Object.entries(JAVA_BREEDING_FOOD_TAGS)) {
        const entity = javaEntityTypeToBedrock(javaEntity);
        if (entity.kind !== 'mapped' || !tags.has('item', tag)) continue;
        foods.set(entity.bedrock, bedrockTagItems(tags, tag));
    }
    return foods;
};

/** The Bedrock items of a Java item tag, each once, in the tag's order. */
export const bedrockTagItems = (tags: ContentTags, tag: string): readonly string[] =>
    bedrockItemsOf(tags.members('item', tag));

/** An item name from a pack, namespaced and with a pre-flattening name replaced by the modern one. */
const modernItemName = (identifier: string): string => {
    const qualified = identifier.includes(':') ? identifier : `minecraft:${identifier}`;
    return legacy_item_aliases[qualified.toLowerCase()] ?? qualified;
};

/** The item a `breed_items` or `feed_items` entry names, whether it is written as a string or as `{item}`. */
export const entryItem = (entry: unknown): string | undefined =>
    typeof entry === 'string' ? entry : isRecord(entry) && typeof entry.item === 'string' ? entry.item : undefined;

/** One item list entry with the item it names in its modern form. */
export const modernEntry = (entry: unknown): unknown => {
    if (typeof entry === 'string') return modernItemName(entry);
    if (!isRecord(entry)) return entry;
    return {
        ...entry,
        ...(typeof entry.item === 'string' ? { item: modernItemName(entry.item) } : {})
    };
};

/** One `minecraft:breedable` body with its items replaced by `foods`, or only modernized when there are none. */
const breedableWith = (
    breedable: Record<string, unknown>,
    foods: readonly string[] | undefined
): Record<string, unknown> => {
    const declared = (Array.isArray(breedable.breed_items) ? breedable.breed_items : [breedable.breed_items])
        .filter((entry) => entry !== undefined)
        .map(modernEntry);
    if (foods === undefined) return { ...breedable, breed_items: declared };

    const accepted = new Set(foods);
    const kept = declared.filter((entry) => {
        const item = entryItem(entry);
        return item !== undefined && accepted.has(item);
    });
    const named = new Set(kept.map(entryItem));
    const added = foods.filter((item) => !named.has(item));
    return { ...breedable, breed_items: [...kept, ...added] };
};

/**
 * Applies Java's breeding food to one entity file in the shape a behavior pack writes.
 *
 * @param data - The parsed JSON of an entity file.
 * @param foods - The Bedrock items Java breeds each entity with, from {@link javaBreedingFoods}.
 * @returns The same object for a file with no `minecraft:breedable`; otherwise a copy whose
 *   breedable components, in its base components and each component group, list the foods.
 */
export const withJavaBreedingFood = (data: unknown, foods: BreedingFoods): unknown => {
    const identifier = entityFileIdentifier(data);
    const food = identifier === undefined ? undefined : foods.get(identifier);
    return withComponentRewritten(data, 'minecraft:breedable', (breedable) => breedableWith(breedable, food));
};
