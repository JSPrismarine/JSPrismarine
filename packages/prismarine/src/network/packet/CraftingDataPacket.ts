import crypto from 'node:crypto';

import type { Recipe } from '../../crafting/Recipe';
import { FurnaceRecipe, ShapedRecipe, ShapelessRecipe, SmithingRecipe } from '../../crafting/Recipe';
import type { Item } from '../../item/Item';
import UUID from '../../utils/UUID';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import { writeEmptyIngredient, writeRecipeIngredient } from '../type/RecipeIngredientCodec';
import DataPacket from './DataPacket';

/** What has to be true before a recipe shows up in the book. */
enum UnlockContext {
    /** Unlocked by holding the ingredients, which are then listed. */
    NONE,
    ALWAYS_UNLOCKED,
    PLAYER_IN_WATER,
    PLAYER_HAS_MANY_ITEMS
}

/** Every recipe this server sends is available from the start. */
const UNLOCK_CONTEXT: UnlockContext = UnlockContext.ALWAYS_UNLOCKED;

/**
 * Every recipe the client is allowed to know about.
 *
 * Sent once, on join, and identical for every player - so the encoded form is worth keeping.
 * See `RecipeManager.revision` for what invalidates it.
 *
 * At 2168 this stopped being one list of tagged entries and became **ten separate lists**, one
 * per recipe shape, each holding entries of that shape only. There is no longer a type id in
 * front of a recipe - its position in the packet is its type - so the old `RecipeEntryType`
 * has no part in writing this any more.
 *
 * Furnace recipes are the casualty of that change: the format has no list for them, and none
 * of the other nine will take one. Smelting is data driven on the client now. The server still
 * keeps its furnace recipes and still smelts with them; it just no longer says so here.
 *
 * **Bound To:** Client
 */
export default class CraftingDataPacket extends DataPacket {
    public static NetID = Identifiers.CraftingDataPacket;

    public recipes: readonly Recipe[] = [];

    /** Whether the client should throw away the recipes it already had. */
    public cleanRecipes = true;

    /**
     * The net id a recipe is known by, which is its position in the manager's list.
     *
     * Passed in rather than looked up so that this packet needs nothing but what it is given,
     * and so a test can write one recipe without standing up a manager.
     */
    public netIdOf: (recipe: Recipe) => number = (_recipe) => 0;

    public encodePayload(): void {
        const shaped: ShapedRecipe[] = [];
        const shapeless: ShapelessRecipe[] = [];
        const smithing: SmithingRecipe[] = [];

        for (const recipe of this.recipes) {
            if (recipe instanceof ShapedRecipe) shaped.push(recipe);
            else if (recipe instanceof ShapelessRecipe) shapeless.push(recipe);
            else if (recipe instanceof SmithingRecipe) smithing.push(recipe);
            else if (recipe instanceof FurnaceRecipe)
                continue; // No list to put it in - see above.
            else throw new Error(`Recipe ${recipe.id} is of a kind this packet cannot write`);
        }

        this.writeList(shaped, (recipe) => this.writeShaped(recipe));
        this.writeList(shapeless, (recipe) => this.writeShapeless(recipe));

        // Multi, shulker box, shapeless chemistry and shaped chemistry. Written empty rather
        // than left out: absent, they do not save four bytes, they misalign everything after
        // them - which now includes every recipe list that follows.
        this.writeUnsignedVarInt(0);
        this.writeUnsignedVarInt(0);
        this.writeUnsignedVarInt(0);
        this.writeUnsignedVarInt(0);

        this.writeList(smithing, (recipe) => this.writeSmithingTransform(recipe));
        this.writeUnsignedVarInt(0); // Smithing trim.

        this.writeUnsignedVarInt(0); // Potion type recipes.
        this.writeUnsignedVarInt(0); // Potion container recipes.
        this.writeUnsignedVarInt(0); // Material reducer recipes.

        this.writeBoolean(this.cleanRecipes);
    }

    private writeList<T extends Recipe>(recipes: readonly T[], write: (recipe: T) => void): void {
        this.writeUnsignedVarInt(recipes.length);
        for (const recipe of recipes) write(recipe);
    }

    private writeShapeless(recipe: ShapelessRecipe): void {
        NetworkUtil.writeString(this, recipe.id);

        const ingredients = recipe.getIngredients();
        this.writeUnsignedVarInt(ingredients.length);
        for (const ingredient of ingredients) writeRecipeIngredient(this, ingredient);

        this.writeOutputs(recipe.getOutputs());

        UUID.fromBinary(CraftingDataPacket.uuidFor(recipe.id), 3).networkSerialize(this);
        NetworkUtil.writeString(this, recipe.station);
        this.writeVarInt(recipe.priority);
        this.writeUnlockingRequirement();
        this.writeUnsignedVarInt(this.netIdOf(recipe));
    }

    private writeShaped(recipe: ShapedRecipe): void {
        NetworkUtil.writeString(this, recipe.id);

        this.writeVarInt(recipe.width);
        this.writeVarInt(recipe.height);

        // The pattern is a counted list now, where 748 left the reader to work out its length
        // from the width and the height. Both are still sent, and the client checks that they
        // agree - a count that is not width times height is rejected outright.
        this.writeUnsignedVarInt(recipe.width * recipe.height);

        // Every slot, holes included: an empty slot in the pattern is an ingredient of no
        // kind on the wire, not an ingredient that was skipped.
        for (let y = 0; y < recipe.height; y++) {
            for (let x = 0; x < recipe.width; x++) {
                const ingredient = recipe.at(x, y);
                if (ingredient) writeRecipeIngredient(this, ingredient);
                else writeEmptyIngredient(this);
            }
        }

        this.writeOutputs(recipe.getOutputs());

        UUID.fromBinary(CraftingDataPacket.uuidFor(recipe.id), 3).networkSerialize(this);
        NetworkUtil.writeString(this, recipe.station);
        this.writeVarInt(recipe.priority);
        this.writeBoolean(recipe.symmetric);
        this.writeUnlockingRequirement();
        this.writeUnsignedVarInt(this.netIdOf(recipe));
    }

    private writeSmithingTransform(recipe: SmithingRecipe): void {
        NetworkUtil.writeString(this, recipe.id);

        writeRecipeIngredient(this, recipe.template);
        writeRecipeIngredient(this, recipe.input);
        writeRecipeIngredient(this, recipe.addition);

        recipe.output.networkSerializeWithoutStackId(this);
        NetworkUtil.writeString(this, recipe.station);
        this.writeUnsignedVarInt(this.netIdOf(recipe));
    }

    /** The output list, in the form that carries no stack id - nothing is tracking these. */
    private writeOutputs(outputs: readonly Item[]): void {
        this.writeUnsignedVarInt(outputs.length);
        for (const output of outputs) output.networkSerializeWithoutStackId(this);
    }

    /**
     * What has to be done before a recipe appears in the book.
     *
     * An optional now, so it opens with a byte saying whether anything follows at all. Inside
     * it, a context and then a second byte that is set only when the context is `NONE` - the
     * one case where a list of unlocking ingredients follows. This server unlocks everything
     * from the start, so the context says so and no list is written.
     *
     * Up to 748 this was a bare `true`. Left as it was, the client read that byte as "an
     * optional is present" and then took the recipe's net id for the context - so every recipe
     * after the first was one field out.
     */
    private writeUnlockingRequirement(): void {
        this.writeBoolean(true); // The optional is present.
        this.writeVarInt(UNLOCK_CONTEXT);
        this.writeBoolean(UNLOCK_CONTEXT === UnlockContext.NONE);
    }

    /**
     * A recipe's UUID, derived from its id.
     *
     * The data carries none, and it cannot be random: the client keys its recipe book on
     * these, so a fresh set each start is a book that resets itself. Hashing the id gives the
     * same answer every time, from the one thing a recipe is guaranteed to have.
     */
    public static uuidFor(id: string): Buffer {
        return crypto.createHash('md5').update(id).digest();
    }
}
