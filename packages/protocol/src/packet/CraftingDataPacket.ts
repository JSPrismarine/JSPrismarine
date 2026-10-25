import crypto from 'node:crypto';

import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import ItemStack from '../structure/ItemStack';
import RecipeIngredient from '../structure/RecipeIngredient';
import UUID from '../structure/UUID';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { ItemStackData } from '../structure/ItemStack';
import type { RecipeIngredientData } from '../structure/RecipeIngredient';

/** The docs' `RecipeUnlockingContext`: what has to be true before a recipe shows up in the book. */
export enum RecipeUnlockingContext {
    /** Unlocked by holding the ingredients, which are then listed. */
    NONE,
    ALWAYS_UNLOCKED,
    PLAYER_IN_WATER,
    PLAYER_HAS_MANY_ITEMS
}

/** Every recipe this packet writes is available from the start. */
const UNLOCK_CONTEXT: RecipeUnlockingContext = RecipeUnlockingContext.ALWAYS_UNLOCKED;

/** What every recipe entry carries, whichever list it sits in. */
interface RecipeBase {
    /** The recipe's identifier, which the client keys its book on. */
    id: string;
    /** The id this recipe is known by for the rest of the session. Zero is "no recipe". */
    netId: number;
    /** The Bedrock block tag of the station, such as `crafting_table`. */
    station: string;
}

/** A shaped crafting recipe. */
export interface ShapedRecipe extends RecipeBase {
    width: number;
    height: number;
    /** `width * height` slots in row-major order, holes included as empty slots. */
    pattern: readonly RecipeIngredientData[];
    outputs: readonly ItemStackData[];
    /** Which of two matching recipes wins. */
    priority: number;
    /** Whether the client may match the pattern mirrored. */
    symmetric: boolean;
}

/** A shapeless crafting recipe, which is also how a stonecutter recipe travels. */
export interface ShapelessRecipe extends RecipeBase {
    ingredients: readonly RecipeIngredientData[];
    outputs: readonly ItemStackData[];
    priority: number;
}

/** A smithing table recipe that produces a new item. */
export interface SmithingTransformRecipe extends RecipeBase {
    template: RecipeIngredientData;
    base: RecipeIngredientData;
    addition: RecipeIngredientData;
    output: ItemStackData;
}

/**
 * A brewing stand recipe, which carries numeric item ids rather than names.
 *
 * Six varint32 in wire order: the input's id and aux value, the reagent's, the output's. It is
 * the one entry in this packet that names nothing, so a caller has to resolve the three items
 * against the item registry first.
 */
export interface PotionMix {
    inputId: number;
    inputMeta: number;
    reagentId: number;
    reagentMeta: number;
    outputId: number;
    outputMeta: number;
}

/** The lists `CraftingDataPacket` carries, and the flag that closes it. */
export interface CraftingData {
    shaped: readonly ShapedRecipe[];
    shapeless: readonly ShapelessRecipe[];
    smithingTransform: readonly SmithingTransformRecipe[];
    potionMixes: readonly PotionMix[];
    /** Whether the client should throw away the recipes it already had. */
    cleanRecipes: boolean;
}

/**
 * The UUID a recipe travels under, derived from its id.
 *
 * The data carries none, and it cannot be random: the client keys its recipe book on these, so
 * a fresh set each start is a book that resets itself. Hashing the id gives the same answer
 * every time, from the one thing a recipe is guaranteed to have.
 * @param id - The recipe's identifier.
 * @returns The sixteen digest bytes, in the big endian order a UUID is written in.
 */
export const recipeUuidFor = (id: string): Buffer => crypto.createHash('md5').update(id).digest();

/** Writes a recipe's UUID as an `mce::UUID`: two uint64 little endian halves. */
const writeRecipeUuid = (stream: NetworkBinaryStream, id: string): void => {
    const digest = recipeUuidFor(id);
    new UUID(digest.readBigUInt64BE(0), digest.readBigUInt64BE(8)).serialize(stream);
};

/**
 * What has to be done before a recipe appears in the book.
 *
 * An optional, so it opens with a byte saying whether anything follows at all. Inside it, a
 * context and then a second byte that is set only when the context is `NONE`, the one case
 * where a list of unlocking ingredients follows. Every recipe here is unlocked from the start,
 * so the context says so and no list is written.
 *
 * Up to 748 this was a bare `true`. Left as it was, the client reads that byte as "an optional
 * is present" and then takes the recipe's net id for the context, so every recipe after the
 * first is one field out.
 */
const writeUnlockingRequirement = (stream: NetworkBinaryStream): void => {
    stream.writeBoolean(true); // The optional is present.
    stream.writeVarInt(UNLOCK_CONTEXT);
    // The ingredient list follows only under `NONE`, and this writer never uses that context.
    stream.writeBoolean(false);
};

/** The output list, in the form that carries no stack id - nothing is tracking these. */
const writeOutputs = (stream: NetworkBinaryStream, outputs: readonly ItemStackData[]): void => {
    stream.writeUnsignedVarInt(outputs.length);
    for (const output of outputs) ItemStack.from(output).serialize(stream);
};

const writeShapeless = (stream: NetworkBinaryStream, recipe: ShapelessRecipe): void => {
    stream.writeString(recipe.id);

    stream.writeUnsignedVarInt(recipe.ingredients.length);
    for (const ingredient of recipe.ingredients) RecipeIngredient.from(ingredient).serialize(stream);

    writeOutputs(stream, recipe.outputs);

    writeRecipeUuid(stream, recipe.id);
    stream.writeString(recipe.station);
    stream.writeVarInt(recipe.priority);
    writeUnlockingRequirement(stream);
    stream.writeUnsignedVarInt(recipe.netId);
};

const writeShaped = (stream: NetworkBinaryStream, recipe: ShapedRecipe): void => {
    stream.writeString(recipe.id);

    stream.writeVarInt(recipe.width);
    stream.writeVarInt(recipe.height);

    // The pattern is a counted list now, where 748 left the reader to work out its length from
    // the width and the height. Both are still sent, and the client checks that they agree: a
    // count that is not width times height is rejected outright.
    stream.writeUnsignedVarInt(recipe.pattern.length);
    for (const slot of recipe.pattern) RecipeIngredient.from(slot).serialize(stream);

    writeOutputs(stream, recipe.outputs);

    writeRecipeUuid(stream, recipe.id);
    stream.writeString(recipe.station);
    stream.writeVarInt(recipe.priority);
    stream.writeBoolean(recipe.symmetric);
    writeUnlockingRequirement(stream);
    stream.writeUnsignedVarInt(recipe.netId);
};

const writeSmithingTransform = (stream: NetworkBinaryStream, recipe: SmithingTransformRecipe): void => {
    stream.writeString(recipe.id);

    RecipeIngredient.from(recipe.template).serialize(stream);
    RecipeIngredient.from(recipe.base).serialize(stream);
    RecipeIngredient.from(recipe.addition).serialize(stream);

    ItemStack.from(recipe.output).serialize(stream);
    stream.writeString(recipe.station);
    stream.writeUnsignedVarInt(recipe.netId);
};

const writePotionMix = (stream: NetworkBinaryStream, mix: PotionMix): void => {
    stream.writeVarInt(mix.inputId);
    stream.writeVarInt(mix.inputMeta);
    stream.writeVarInt(mix.reagentId);
    stream.writeVarInt(mix.reagentMeta);
    stream.writeVarInt(mix.outputId);
    stream.writeVarInt(mix.outputMeta);
};

/**
 * Writes the eleven arrays and the flag without a packet header, for a caller that writes its
 * own. The server's own packet class is that caller: it holds recipes as its own objects and
 * needs the bytes of the payload alone, so the format lives here once.
 */
export const writeCraftingData = (stream: NetworkBinaryStream, data: CraftingData): void => {
    stream.writeUnsignedVarInt(data.shaped.length);
    for (const recipe of data.shaped) writeShaped(stream, recipe);

    stream.writeUnsignedVarInt(data.shapeless.length);
    for (const recipe of data.shapeless) writeShapeless(stream, recipe);

    // Multi Recipes, User Data Shapeless Recipes, Shapeless Chemistry Recipes and Shaped
    // Chemistry Recipes.
    stream.writeUnsignedVarInt(0);
    stream.writeUnsignedVarInt(0);
    stream.writeUnsignedVarInt(0);
    stream.writeUnsignedVarInt(0);

    stream.writeUnsignedVarInt(data.smithingTransform.length);
    for (const recipe of data.smithingTransform) writeSmithingTransform(stream, recipe);

    stream.writeUnsignedVarInt(0); // Smithing Trim Recipes.

    stream.writeUnsignedVarInt(data.potionMixes.length);
    for (const mix of data.potionMixes) writePotionMix(stream, mix);

    stream.writeUnsignedVarInt(0); // Container Mixes.
    stream.writeUnsignedVarInt(0); // Material Reducers.

    stream.writeBoolean(data.cleanRecipes);
};

const readList = <T>(stream: NetworkBinaryStream, read: () => T): T[] => {
    const entries: T[] = [];
    for (let count = stream.readUnsignedVarInt(); count > 0; count--) entries.push(read());
    return entries;
};

/**
 * The UUID, the station and the priority, which a shaped and a shapeless recipe share.
 *
 * The UUID is read past rather than returned: {@link recipeUuidFor} derives it from the
 * recipe's id, so keeping it would be keeping a second copy of the id.
 */
const readUuidStationPriority = (stream: NetworkBinaryStream): { station: string; priority: number } => {
    stream.readUnsignedLongLE();
    stream.readUnsignedLongLE();
    return { station: stream.readString(), priority: stream.readVarInt() };
};

/**
 * Reads the optional unlocking requirement. Both bytes inside it are read whatever the context
 * says, because the second one is written whatever the context says.
 * @throws {Error} When a list of unlocking ingredients follows, which has no payload type.
 */
const readUnlockingRequirement = (stream: NetworkBinaryStream): void => {
    if (!stream.readBoolean()) return;

    const context = stream.readVarInt();
    const listFollows = stream.readBoolean();
    if (context === RecipeUnlockingContext.NONE && listFollows) {
        throw new Error('Cannot read a recipe that lists its unlocking ingredients');
    }
};

const readShaped = (stream: NetworkBinaryStream): ShapedRecipe => {
    const id = stream.readString();
    const width = stream.readVarInt();
    const height = stream.readVarInt();
    const pattern = readList(stream, () => RecipeIngredient.deserialize(stream).toData());
    const outputs = readList(stream, () => ItemStack.deserialize(stream).toData());
    const { station, priority } = readUuidStationPriority(stream);
    const symmetric = stream.readBoolean();
    readUnlockingRequirement(stream);

    return { id, netId: stream.readUnsignedVarInt(), station, width, height, pattern, outputs, priority, symmetric };
};

const readShapeless = (stream: NetworkBinaryStream): ShapelessRecipe => {
    const id = stream.readString();
    const ingredients = readList(stream, () => RecipeIngredient.deserialize(stream).toData());
    const outputs = readList(stream, () => ItemStack.deserialize(stream).toData());
    const { station, priority } = readUuidStationPriority(stream);
    readUnlockingRequirement(stream);

    return { id, netId: stream.readUnsignedVarInt(), station, ingredients, outputs, priority };
};

const readSmithingTransform = (stream: NetworkBinaryStream): SmithingTransformRecipe => {
    const id = stream.readString();
    const template = RecipeIngredient.deserialize(stream).toData();
    const base = RecipeIngredient.deserialize(stream).toData();
    const addition = RecipeIngredient.deserialize(stream).toData();
    const output = ItemStack.deserialize(stream).toData();

    return { id, station: stream.readString(), netId: stream.readUnsignedVarInt(), template, base, addition, output };
};

const readPotionMix = (stream: NetworkBinaryStream): PotionMix => ({
    inputId: stream.readVarInt(),
    inputMeta: stream.readVarInt(),
    reagentId: stream.readVarInt(),
    reagentMeta: stream.readVarInt(),
    outputId: stream.readVarInt(),
    outputMeta: stream.readVarInt()
});

/**
 * Reads the eleven arrays and the flag, the mirror of {@link writeCraftingData}.
 *
 * @throws {Error} When one of the five lists with no payload type is not empty, since nothing
 * after it could be read without knowing its entries' layout.
 */
export const readCraftingData = (stream: NetworkBinaryStream): CraftingData => {
    const shaped = readList(stream, () => readShaped(stream));
    const shapeless = readList(stream, () => readShapeless(stream));

    for (let skipped = 0; skipped < 4; skipped++) {
        if (stream.readUnsignedVarInt() !== 0) {
            throw new Error('Cannot read a chemistry, multi or user data shapeless recipe');
        }
    }

    const smithingTransform = readList(stream, () => readSmithingTransform(stream));
    if (stream.readUnsignedVarInt() !== 0) throw new Error('Cannot read a smithing trim recipe');

    const potionMixes = readList(stream, () => readPotionMix(stream));
    if (stream.readUnsignedVarInt() !== 0) throw new Error('Cannot read a container mix');
    if (stream.readUnsignedVarInt() !== 0) throw new Error('Cannot read a material reducer');

    return { shaped, shapeless, smithingTransform, potionMixes, cleanRecipes: stream.readBoolean() };
};

/**
 * Every recipe the client is allowed to know about.
 *
 * Sent once, on join, and identical for every player, so the encoded form is worth keeping.
 *
 * Wire order at protocol 2193 is eleven arrays and a flag, each array a varuint count followed
 * by its entries: Shaped Recipes, Shapeless Recipes, Multi Recipes, User Data Shapeless
 * Recipes, Shapeless Chemistry Recipes, Shaped Chemistry Recipes, Smithing Transform Recipes,
 * Smithing Trim Recipes, Potion Mixes, Container Mixes, Material Reducers, then Clear Recipes
 * as a boolean. There is no type id in front of a recipe: its list is its type.
 *
 * Four of the eleven have no payload type here and are written empty. Written empty rather than
 * left out: absent, they do not save four bytes, they misalign everything after them. Cooking
 * recipes have no list at all at this version, because smelting became client-side data; a
 * server still smelts with its own recipes, it just no longer says so here.
 *
 * An ingredient is a {@link RecipeIngredient}, which is the legacy descriptor form and not the
 * `recipe-ingredient` type page's. A result is an {@link ItemStack}.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/crafting-data-packet/
 */
export default class CraftingDataPacket extends NetworkPacket<CraftingData> {
    public get id(): number {
        return PacketIdentifier.CRAFTING_DATA;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: CraftingData): void {
        writeCraftingData(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): CraftingData {
        return readCraftingData(stream);
    }
}
