import { item_tags } from '@jsprismarine/bedrock-data';
import { vanillaRecipes } from '@jsprismarine/minecraft';

import { Item } from '../item/Item';
import type { Recipe } from './Recipe';
import { FurnaceRecipe, ShapedRecipe, ShapelessRecipe, SmithingRecipe } from './Recipe';
import type { RecipeIngredient } from './RecipeIngredient';
import { ANY_META, ItemIngredient, TagIngredient } from './RecipeIngredient';

/** An item as the generated file writes it. */
interface GeneratedItem {
    name: string;
    meta: number;
    count: number;
}

/**
 * An ingredient named by what it must carry rather than by what it is.
 *
 * Only the per-release behaviour pack layers write these; the 1.13 baseline the catalogue used
 * to be built from named every alternative out in full, which is why nothing vanilla loaded as
 * a tag before.
 */
interface GeneratedTag {
    tag: string;
    count: number;
}

/** An ingredient is one or the other; a result is always an item. */
type GeneratedIngredient = GeneratedItem | GeneratedTag;

const isTag = (raw: GeneratedIngredient): raw is GeneratedTag => 'tag' in raw;
const isItem = (raw: GeneratedIngredient): raw is GeneratedItem => !isTag(raw);

interface GeneratedRecipe {
    kind: 'shaped' | 'shapeless' | 'furnace' | 'smithing';
    id: string;
    station: string;
    priority?: number;
    width?: number;
    height?: number;
    slots?: Array<GeneratedIngredient | null>;
    ingredients?: GeneratedIngredient[];
    outputs?: GeneratedItem[];
    input?: GeneratedIngredient;
    output?: GeneratedItem;
    template?: GeneratedIngredient;
    addition?: GeneratedIngredient;
}

/**
 * Whether the server can make sense of a name.
 *
 * Injected rather than reached for, so the filter can be tested without a server and so a
 * caller who wants everything - a tool listing them - can say so.
 */
export type KnownItem = (name: string) => boolean;

/** What each tag is satisfied by, as the item table of the pinned version has it. */
const membersOf = (tag: string, known: KnownItem): string[] =>
    ((item_tags as Record<string, string[]>)[tag] ?? []).filter(known);

const toIngredient = (raw: GeneratedIngredient, known: KnownItem): RecipeIngredient =>
    isTag(raw)
        ? new TagIngredient(raw.tag, new Set(membersOf(raw.tag, known)), raw.count ?? 1)
        : new ItemIngredient(raw.name, raw.meta ?? ANY_META, raw.count ?? 1);

const toItem = (raw: GeneratedItem): Item =>
    new Item({
        // Resolved from the name by the item table; the numeric id is only a fallback.
        id: 0,
        name: raw.name,
        // A wildcard is a question and an output is an answer, so it never leaves as one.
        meta: raw.meta === ANY_META ? 0 : (raw.meta ?? 0),
        count: raw.count ?? 1
    });

/** Everything a recipe mentions, on either side. */
const referencesOf = (recipe: GeneratedRecipe): GeneratedIngredient[] => [
    ...(recipe.slots ?? []).filter((slot): slot is GeneratedIngredient => slot !== null),
    ...(recipe.ingredients ?? []),
    ...(recipe.outputs ?? []),
    ...(recipe.input ? [recipe.input] : []),
    ...(recipe.output ? [recipe.output] : []),
    ...(recipe.template ? [recipe.template] : []),
    ...(recipe.addition ? [recipe.addition] : [])
];

/** Every item name a recipe mentions. A tag names no item, so it contributes none. */
const namesOf = (recipe: GeneratedRecipe): string[] =>
    referencesOf(recipe)
        .filter(isItem)
        .map((item) => item.name);

/**
 * Whether every tag a recipe names is one the server can satisfy.
 *
 * A tag the item table has never heard of, or one whose every member is unknown, leaves an
 * ingredient nothing can match - so the recipe is left out for the same reason one naming an
 * unknown item is. The catalogue is generated from a newer server than the item table beside
 * it, so this is a real case rather than a defensive one: `minecraft:egg` and
 * `minecraft:metal_nuggets` are named by recipes and absent from the tags of 1.21.40.
 */
const tagsResolve = (recipe: GeneratedRecipe, known: KnownItem): boolean =>
    referencesOf(recipe)
        .filter(isTag)
        .every((raw) => membersOf(raw.tag, known).length > 0);

/**
 * The vanilla recipes, in the model the server reasons about.
 *
 * Read from the generated catalogue, which comes from Mojang's own files in a Bedrock
 * Dedicated Server. Recipes naming anything the server cannot resolve are left out, and that
 * is correctness before economy: a recipe whose output cannot be built is one a player is
 * invited to make and then cannot be given.
 */
export class VanillaRecipes {
    public static load(known: KnownItem): Recipe[] {
        const recipes: Recipe[] = [];

        for (const raw of (vanillaRecipes as { recipes: GeneratedRecipe[] }).recipes) {
            if (!namesOf(raw).every(known) || !tagsResolve(raw, known)) continue;

            const recipe = VanillaRecipes.build(raw, known);
            if (recipe) recipes.push(recipe);
        }

        return recipes;
    }

    private static build(raw: GeneratedRecipe, known: KnownItem): Recipe | null {
        switch (raw.kind) {
            case 'shaped':
                return new ShapedRecipe(
                    raw.id,
                    raw.station,
                    raw.width!,
                    raw.height!,
                    raw.slots!.map((slot) => (slot ? toIngredient(slot, known) : null)),
                    raw.outputs!.map(toItem),
                    raw.priority ?? 0
                );

            case 'shapeless':
                return new ShapelessRecipe(
                    raw.id,
                    raw.station,
                    raw.ingredients!.map((ingredient) => toIngredient(ingredient, known)),
                    raw.outputs!.map(toItem),
                    raw.priority ?? 0
                );

            case 'furnace':
                return new FurnaceRecipe(raw.id, raw.station, toIngredient(raw.input!, known), toItem(raw.output!));

            case 'smithing':
                return new SmithingRecipe(
                    raw.id,
                    raw.station,
                    toIngredient(raw.template!, known),
                    toIngredient(raw.input!, known),
                    toIngredient(raw.addition!, known),
                    toItem(raw.output!)
                );

            default:
                return null;
        }
    }
}

export default VanillaRecipes;
