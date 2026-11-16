/**
 * Java's baby food, written into the `minecraft:ageable` of each entity file as it loads.
 *
 * A Java baby grows when fed what its class eats, and by an amount its class decides. Most
 * animals run `Animal.mobInteract`: anything their breeding tag holds, and a tenth of the time
 * left (`AgeableMob.getSpeedUpSecondsWhenFeeding`). Horses, llamas and camels run their own
 * `handleEating`, which advances a fixed number of seconds per item. Bedrock's pack lists the foods
 * and the growth by hand, and the lists have drifted: a Bedrock wolf pup eats no fish, a dolphin
 * calf only cod and salmon, and a llama cria grows twelve times faster on wheat than Java's. Growth
 * is the server's alone, so Java's rule decides.
 *
 * A pack entry for an item Java also feeds keeps its other fields, such as a `result_item`.
 */
import { javaEntityTypeToBedrock, javaItemToBedrock } from '@jsprismarine/mapping';

import type { ContentTags } from '../content/tags';
import { isRecord } from '../utils/isRecord';
import { entityFileIdentifier, withComponentRewritten } from './definitionOverlay';
import { bedrockTagItems, entryItem, JAVA_BREEDING_FOOD_TAGS, modernEntry } from './javaBreedingFood';

/** Seconds per item from Java's `AbstractHorse.handleEating`, which every horse, donkey and mule runs. */
const HORSE_SECONDS: Readonly<Record<string, number>> = {
    'minecraft:wheat': 20,
    'minecraft:sugar': 30,
    'minecraft:hay_block': 180,
    'minecraft:apple': 60,
    'minecraft:carrot': 60,
    'minecraft:golden_carrot': 60,
    'minecraft:golden_apple': 240,
    'minecraft:enchanted_golden_apple': 240
};

/** Seconds per item from Java's `Llama.handleEating`, which `TraderLlama` inherits. */
const LLAMA_SECONDS: Readonly<Record<string, number>> = { 'minecraft:wheat': 10, 'minecraft:hay_block': 90 };

/** How one Java baby grows when fed. */
type JavaBabyFood =
    /** Anything in the tag, by a tenth of the time left. */
    | { readonly tag: string }
    /** Each listed Java item, by its fixed seconds. */
    | { readonly seconds: Readonly<Record<string, number>> }
    /** Anything in the tag, by the same fixed seconds. */
    | { readonly tag: string; readonly each: number };

/** The Java rules that differ from `Animal.mobInteract` with the breeding tag, by Java entity type. */
const JAVA_BABY_FOOD_RULES: Readonly<Record<string, JavaBabyFood>> = {
    'minecraft:horse': { seconds: HORSE_SECONDS },
    'minecraft:donkey': { seconds: HORSE_SECONDS },
    'minecraft:mule': { seconds: HORSE_SECONDS },
    'minecraft:llama': { seconds: LLAMA_SECONDS },
    'minecraft:trader_llama': { seconds: LLAMA_SECONDS },
    // `Camel.handleEating` calls `ageUp(10)` for anything in its food tag.
    'minecraft:camel': { tag: 'minecraft:camel_food', each: 10 },
    // `Dolphin` is no `Animal`; its `mobInteract` feeds a calf anything in `minecraft:fishes`.
    'minecraft:dolphin': { tag: 'minecraft:fishes' }
};

/** One item a baby eats: the Bedrock item, and its fixed seconds, or undefined for a tenth of the time left. */
export interface BabyFoodItem {
    readonly item: string;
    readonly seconds: number | undefined;
}

/** The items each Bedrock entity's baby eats, by Bedrock identifier. */
export type BabyFoods = ReadonlyMap<string, readonly BabyFoodItem[]>;

/** The Bedrock items of one rule, with the seconds each advances. */
const ruleItems = (tags: ContentTags, rule: JavaBabyFood): readonly BabyFoodItem[] | undefined => {
    if ('seconds' in rule)
        return Object.entries(rule.seconds).flatMap(([javaItem, seconds]) => {
            const mapped = javaItemToBedrock(javaItem);
            return mapped.kind === 'unknown' ? [] : [{ item: mapped.bedrock.identifier, seconds }];
        });
    if (!tags.has('item', rule.tag)) return undefined;
    const seconds = 'each' in rule ? rule.each : undefined;
    return bedrockTagItems(tags, rule.tag).map((item) => ({ item, seconds }));
};

/**
 * Resolves each Java baby's food against a tag set into Bedrock items.
 *
 * An animal whose tag the stack does not define is left out, so its pack's own list stays.
 */
export const javaBabyFoods = (tags: ContentTags): BabyFoods => {
    const rules: Record<string, JavaBabyFood> = {};
    for (const [javaEntity, tag] of Object.entries(JAVA_BREEDING_FOOD_TAGS)) rules[javaEntity] = { tag };
    Object.assign(rules, JAVA_BABY_FOOD_RULES);

    const foods = new Map<string, readonly BabyFoodItem[]>();
    for (const [javaEntity, rule] of Object.entries(rules)) {
        const entity = javaEntityTypeToBedrock(javaEntity);
        const items = ruleItems(tags, rule);
        if (entity.kind === 'mapped' && items !== undefined) foods.set(entity.bedrock, items);
    }
    return foods;
};

/** Seconds a baby takes to grow up when an `minecraft:ageable` body writes none, which is Bedrock's default. */
const DEFAULT_DURATION = 1200;

/**
 * One `minecraft:ageable` body with its feed items replaced by `foods`.
 *
 * A fixed number of seconds is written as the `growth` fraction of the body's duration, which is
 * how the component reads a fixed advance; an item with no `growth` advances a tenth of the time left.
 */
const ageableWith = (ageable: Record<string, unknown>, foods: readonly BabyFoodItem[]): Record<string, unknown> => {
    const declared = (Array.isArray(ageable.feed_items) ? ageable.feed_items : [ageable.feed_items])
        .filter((entry) => entry !== undefined)
        .map(modernEntry);
    const duration = typeof ageable.duration === 'number' && ageable.duration > 0 ? ageable.duration : DEFAULT_DURATION;
    const feedItems = foods.map(({ item, seconds }) => {
        const kept = declared.find((entry) => entryItem(entry) === item);
        const { growth: _bedrockGrowth, ...fields } = isRecord(kept) ? kept : {};
        if (seconds !== undefined) return { ...fields, item, growth: seconds / duration };
        return Object.keys(fields).some((key) => key !== 'item') ? { ...fields, item } : item;
    });
    return { ...ageable, feed_items: feedItems };
};

/**
 * Applies Java's baby food to one entity file in the shape a behavior pack writes.
 *
 * @param data - The parsed JSON of an entity file.
 * @param foods - The Bedrock items each Java baby eats, from {@link javaBabyFoods}.
 * @returns The same object for a file with no `minecraft:ageable` or no Java rule; otherwise a
 *   copy whose ageable components feed Java's items by Java's amounts.
 */
export const withJavaBabyFood = (data: unknown, foods: BabyFoods): unknown => {
    const identifier = entityFileIdentifier(data);
    const food = identifier === undefined ? undefined : foods.get(identifier);
    if (food === undefined) return data;
    return withComponentRewritten(data, 'minecraft:ageable', (ageable) => ageableWith(ageable, food));
};
