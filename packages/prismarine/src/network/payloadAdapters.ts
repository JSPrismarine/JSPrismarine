import { ItemInstanceUserData, NetworkBinaryStream } from '@jsprismarine/protocol';

import type {
    CreativeContent,
    CraftingData,
    ItemStackData,
    PotionMix,
    RecipeIngredientData
} from '@jsprismarine/protocol';
import type { CreativeEntry, CreativeGroup } from '../inventory/CreativeInventory';
import type { Recipe } from '../crafting/Recipe';
import { FurnaceRecipe, ShapedRecipe, ShapelessRecipe, SmithingRecipe } from '../crafting/Recipe';
import type { RecipeIngredient } from '../crafting/RecipeIngredient';
import type { Item } from '../item/Item';

/** The empty slot of a shaped pattern: an ingredient of no kind at all. */
const EMPTY_SLOT: RecipeIngredientData = { descriptor: null, count: 0 };

/** Converts a server ingredient into the plain slot carried by Protocol's crafting payload. */
const asSlot = (ingredient: RecipeIngredient | null): RecipeIngredientData =>
    ingredient ? { descriptor: ingredient.describe(), count: ingredient.count } : EMPTY_SLOT;

/** Converts this server's item model into the stack data Protocol writes. */
export const itemAsStack = (item: Item): ItemStackData => {
    const blob = new NetworkBinaryStream();
    const blocksAttacks = item.hasComponent('minecraft:blocks_attacks');
    new ItemInstanceUserData(null, blocksAttacks ? { blockingTick: 0n } : {}).serialize(blob);

    return {
        // Air is the empty slot, whose wire id is zero. The item table assigns air -158.
        runtimeId: item.getName() === 'minecraft:air' ? 0 : item.getRuntimeId(),
        count: item.getAmount(),
        meta: item.meta,
        blockRuntimeId: item.getBlockRuntimeId(),
        userData: blob.getBuffer()
    };
};

/** Builds the Protocol creative payload from the server's item-backed creative catalog. */
export const creativeContentFrom = (
    groups: readonly CreativeGroup[],
    entries: readonly CreativeEntry[]
): CreativeContent => ({
    groups: groups.map(({ category, name, icon }) => ({ category, name, icon: itemAsStack(icon) })),
    entries: entries.map(({ item, group }) => ({ item: itemAsStack(item), group }))
});

/** Builds the Protocol crafting payload from the server's recipe models. */
export const craftingDataFromRecipes = (
    recipes: readonly Recipe[],
    netIdOf: (recipe: Recipe) => number = (recipe) => recipes.indexOf(recipe) + 1,
    potionMixes: readonly PotionMix[] = [],
    cleanRecipes = true
): CraftingData => {
    const shaped: CraftingData['shaped'][number][] = [];
    const shapeless: CraftingData['shapeless'][number][] = [];
    const smithingTransform: CraftingData['smithingTransform'][number][] = [];

    for (const recipe of recipes) {
        const base = { id: recipe.id, netId: netIdOf(recipe), station: recipe.station };

        if (recipe instanceof ShapedRecipe) {
            // Every slot, holes included: empty positions are explicit recipe ingredients.
            const pattern: RecipeIngredientData[] = [];
            for (let y = 0; y < recipe.height; y++) {
                for (let x = 0; x < recipe.width; x++) pattern.push(asSlot(recipe.at(x, y)));
            }

            shaped.push({
                ...base,
                width: recipe.width,
                height: recipe.height,
                pattern,
                outputs: recipe.getOutputs().map(itemAsStack),
                priority: recipe.priority,
                symmetric: recipe.symmetric
            });
        } else if (recipe instanceof ShapelessRecipe) {
            shapeless.push({
                ...base,
                ingredients: recipe.getIngredients().map((ingredient) => asSlot(ingredient)),
                outputs: recipe.getOutputs().map(itemAsStack),
                priority: recipe.priority
            });
        } else if (recipe instanceof SmithingRecipe) {
            smithingTransform.push({
                ...base,
                template: asSlot(recipe.template),
                base: asSlot(recipe.input),
                addition: asSlot(recipe.addition),
                output: itemAsStack(recipe.output)
            });
        } else if (!(recipe instanceof FurnaceRecipe)) {
            // Furnace recipes have no list in this protocol; unknown kinds must not be truncated.
            throw new Error(`Recipe ${recipe.id} is of a kind this server cannot send`);
        }
    }

    return { shaped, shapeless, smithingTransform, potionMixes: [...potionMixes], cleanRecipes };
};
