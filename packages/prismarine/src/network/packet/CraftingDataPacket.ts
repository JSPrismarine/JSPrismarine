import { NetworkBinaryStream, readCraftingData, recipeUuidFor, writeCraftingData } from '@jsprismarine/protocol';

import type { Recipe } from '../../crafting/Recipe';
import { FurnaceRecipe, ShapedRecipe, ShapelessRecipe, SmithingRecipe } from '../../crafting/Recipe';
import type { RecipeIngredient } from '../../crafting/RecipeIngredient';
import type { Item } from '../../item/Item';
import { itemAsStack } from './CreativeContentPacket';
import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

import type { CraftingData, PotionMix, RecipeIngredientData } from '@jsprismarine/protocol';

/** The empty slot of a shaped pattern, which is an ingredient of no kind at all. */
const EMPTY_SLOT: RecipeIngredientData = { descriptor: null, count: 0 };

const asSlot = (ingredient: RecipeIngredient | null): RecipeIngredientData =>
    ingredient ? { descriptor: ingredient.describe(), count: ingredient.count } : EMPTY_SLOT;

const asOutputs = (outputs: readonly Item[]) => outputs.map(itemAsStack);

/**
 * Every recipe the client is allowed to know about, as the server's own `Recipe` objects.
 *
 * The wire format and its eleven arrays belong to `@jsprismarine/protocol`'s packet of the same
 * name, which takes plain numbers and names. This is the server's end of it: the recipe list
 * sorted into the payload's lists on the way out.
 *
 * Sent once, on join, and identical for every player, so the encoded form is worth keeping.
 * See `RecipeManager.revision` for what invalidates it.
 *
 * Furnace recipes are dropped: protocol 2193 has no list for them, because smelting is data
 * driven on the client now. The server still keeps its furnace recipes and still smelts with
 * them; it just no longer says so here.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/crafting-data-packet/
 */
export default class CraftingDataPacket extends FieldNetworkPacket {
    public recipes: readonly Recipe[] = [];

    /** Whether the client should throw away the recipes it already had. */
    public cleanRecipes = true;

    /**
     * Brewing stand recipes, which carry numeric item ids rather than names.
     *
     * Kept apart from {@link recipes} because the server has no `Recipe` class whose
     * ingredients are numbers, and because resolving the three items against the item registry
     * is the caller's job rather than this packet's.
     */
    public potionMixes: readonly PotionMix[] = [];

    /**
     * The net id a recipe is known by, which is its position in the manager's list.
     *
     * Passed in rather than looked up so that this packet needs nothing but what it is given,
     * and so a test can write one recipe without standing up a manager. Without a caller's
     * function it is the recipe's one-based position in {@link recipes}: a net id of zero is
     * not a recipe, and every id in one packet has to differ from every other.
     */
    public netIdOf: (recipe: Recipe) => number = (recipe) => this.recipes.indexOf(recipe) + 1;

    /**
     * The lists as plain values, which replace {@link recipes} and
     * {@link potionMixes} when set.
     *
     * The content build compiles Java's recipe grammar straight into these,
     * so there is no `Recipe` object to go through and no second place for
     * the sorting rules to live.
     */
    public payload: CraftingData | null = null;

    /** Sorts the recipes into the payload's lists and hands them to the protocol writer. */
    public encodePayload(): void {
        const stream = new NetworkBinaryStream();
        writeCraftingData(stream, this.payload ?? this.fromRecipes());
        this.write(stream.getBuffer());
    }

    /**
     * Reads the lists back into {@link payload} with the protocol reader.
     *
     * The decoded form stays as plain lists: nothing rebuilds `Recipe` objects from the wire,
     * because the server's recipes come from its own manager, not from a peer.
     */
    public decodePayload(): void {
        this.payload = readCraftingData(new NetworkBinaryStream(this.readRemaining()));
        this.cleanRecipes = this.payload.cleanRecipes;
    }

    private fromRecipes(): CraftingData {
        const shaped: CraftingData['shaped'][number][] = [];
        const shapeless: CraftingData['shapeless'][number][] = [];
        const smithingTransform: CraftingData['smithingTransform'][number][] = [];

        for (const recipe of this.recipes) {
            const base = { id: recipe.id, netId: this.netIdOf(recipe), station: recipe.station };

            if (recipe instanceof ShapedRecipe) {
                // Every slot, holes included: an empty slot in the pattern is an ingredient of
                // no kind on the wire, not an ingredient that was skipped.
                const pattern: RecipeIngredientData[] = [];
                for (let y = 0; y < recipe.height; y++) {
                    for (let x = 0; x < recipe.width; x++) pattern.push(asSlot(recipe.at(x, y)));
                }

                shaped.push({
                    ...base,
                    width: recipe.width,
                    height: recipe.height,
                    pattern,
                    outputs: asOutputs(recipe.getOutputs()),
                    priority: recipe.priority,
                    symmetric: recipe.symmetric
                });
            } else if (recipe instanceof ShapelessRecipe) {
                shapeless.push({
                    ...base,
                    ingredients: recipe.getIngredients().map((ingredient) => asSlot(ingredient)),
                    outputs: asOutputs(recipe.getOutputs()),
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
                // A furnace recipe has no list to go in; anything else is a kind nothing knows.
                throw new Error(`Recipe ${recipe.id} is of a kind this packet cannot write`);
            }
        }

        return { shaped, shapeless, smithingTransform, potionMixes: this.potionMixes, cleanRecipes: this.cleanRecipes };
    }

    /**
     * A recipe's UUID, derived from its id.
     *
     * The data carries none, and it cannot be random: the client keys its recipe book on these,
     * so a fresh set each start is a book that resets itself.
     */
    public static uuidFor(id: string): Buffer {
        return recipeUuidFor(id);
    }
}
