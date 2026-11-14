/**
 * `CraftingDataPacket`: every recipe the client is allowed to know about.
 *
 * Sent once, on join, and identical for every player. Wire order is eleven arrays and a flag,
 * each array a varuint count followed by its entries: Shaped Recipes, Shapeless Recipes, Multi
 * Recipes, User Data Shapeless Recipes, Shapeless Chemistry Recipes, Shaped Chemistry Recipes,
 * Smithing Transform Recipes, Smithing Trim Recipes, Potion Mixes, Container Mixes, Material
 * Reducers, then Clear Recipes as a boolean. There is no type id in front of a recipe: its
 * list is its type. Both protocols carry the same layout; the 1.26.60 page's only change is
 * the numbering of `MolangVersion`, which no field here interprets (see {@link recipeIngredient}).
 *
 * Cooking recipes have no list at all at this version, because smelting became client-side
 * data; a server still smelts with its own recipes, it just no longer says so here.
 *
 * An ingredient is the legacy descriptor form and not the page's: the real server's bytes in
 * `packages/bedrock-data/src/jsp/v2193/wire/0x34.bin` and `.../v2225/wire/0x34.bin` carry it,
 * and `CraftingDataPacket.test.ts` round trips both. A result is an `ItemStack`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/crafting-data-packet/
 */
import crypto from 'node:crypto';

import { ANY_META } from '../../structure/RecipeIngredient';
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { ItemStackData } from '../../structure/ItemStack';
import type { IngredientDescriptor, RecipeIngredientData } from '../../structure/RecipeIngredient';
import type { PayloadOf } from '../define';
import type { WireType } from '../fieldTypes';

/** The docs' `RecipeUnlockingContext`: what has to be true before a recipe shows up in the book. */
export enum RecipeUnlockingContext {
    /** Unlocked by holding the ingredients, which are then listed. */
    NONE,
    ALWAYS_UNLOCKED,
    PLAYER_IN_WATER,
    PLAYER_HAS_MANY_ITEMS
}

/** Which alternative of the `Item Descriptor` variant is on the wire. */
const VARIANT_INVALID = 0;
const VARIANT_DEFAULT = 1;

/** The names that pick a shape once `DEFAULT` has been selected. */
const NAME_ITEM = 'name';
const NAME_MOLANG = 'molang';
const NAME_TAG = 'item_tag';

/** What every recipe entry carries, whichever list it sits in. */
interface RecipeBase {
    /** The recipe's identifier, which the client keys its book on. */
    id: string;
    /** The id this recipe is known by for the rest of the session. Zero is "no recipe". */
    netId: number;
    /** The Bedrock block tag of the station, such as `crafting_table`. */
    station: string;
}

/**
 * The docs' `RecipeUnlockingRequirement`: the context and, under `NONE`, the ingredients that
 * unlock the recipe.
 */
export interface UnlockingRequirement {
    context: RecipeUnlockingContext;
    /** `Unlocking Ingredients`: null when the optional is absent. */
    ingredients: readonly RecipeIngredientData[] | null;
}

/** What a crafting recipe (shaped or shapeless) carries beyond {@link RecipeBase}. */
interface CraftingRecipeBase extends RecipeBase {
    /**
     * `UUID`, sixteen bytes in the big endian order {@link recipeUuidFor} returns. Left out, the
     * packet derives it from the id, so a payload built from data that has none stays stable.
     */
    uuid?: Buffer;
    /**
     * `Unlocking Requirement`. Left out, every recipe is unlocked from the start; null writes
     * the optional as absent.
     */
    unlocking?: UnlockingRequirement | null;
    /** Which of two matching recipes wins. */
    priority: number;
}

/** A shaped crafting recipe. */
export interface ShapedRecipe extends CraftingRecipeBase {
    width: number;
    height: number;
    /** `width * height` slots in row-major order, holes included as empty slots. */
    pattern: readonly RecipeIngredientData[];
    outputs: readonly ItemStackData[];
    /** Whether the client may match the pattern mirrored. */
    symmetric: boolean;
}

/** A shapeless crafting recipe, which is also how a stonecutter recipe travels. */
export interface ShapelessRecipe extends CraftingRecipeBase {
    ingredients: readonly RecipeIngredientData[];
    outputs: readonly ItemStackData[];
}

/** A built-in recipe the client holds the behavior of, such as map cloning, named by a UUID. */
export interface MultiRecipe {
    /** `Multi-Recipe UUID`, sixteen bytes in the order {@link recipeUuidFor} returns. */
    uuid: Buffer;
    netId: number;
}

/** A smithing table recipe that produces a new item. */
export interface SmithingTransformRecipe extends RecipeBase {
    template: RecipeIngredientData;
    base: RecipeIngredientData;
    addition: RecipeIngredientData;
    output: ItemStackData;
}

/** A smithing table recipe that writes a trim onto the base. */
export interface SmithingTrimRecipe extends RecipeBase {
    template: RecipeIngredientData;
    base: RecipeIngredientData;
    addition: RecipeIngredientData;
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

/** A brewing stand recipe that turns one container into another: three varint32 item ids. */
export interface ContainerMix {
    fromItemId: number;
    reagentItemId: number;
    toItemId: number;
}

/** One output of a {@link MaterialReducer}. */
export interface MaterialReducerOutput {
    itemId: number;
    itemCount: number;
}

/** An Education Edition material reducer entry. */
export interface MaterialReducer {
    /** `From Item Key`: the input's item id and aux value packed into one varint32. */
    fromItemKey: number;
    outputs: readonly MaterialReducerOutput[];
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

/** An `mce::UUID`: sixteen bytes held big endian, written as two uint64 little endian halves. */
const uuid: WireType<Buffer> = t.custom(
    'mce::UUID',
    (stream, value) => {
        if (value.byteLength !== 16) throw new Error(`A recipe UUID is sixteen bytes, got ${value.byteLength}`);
        t.lu64.write(stream, value.readBigUInt64BE(0));
        t.lu64.write(stream, value.readBigUInt64BE(8));
    },
    (stream) => {
        const bytes = Buffer.alloc(16);
        bytes.writeBigUInt64BE(t.lu64.read(stream), 0);
        bytes.writeBigUInt64BE(t.lu64.read(stream), 8);
        return bytes;
    }
);

/**
 * One ingredient slot: the variant selector, the descriptor's name and fields, then the count.
 *
 * A named ingredient goes out under `name` rather than by numeric id, which is what every
 * Bedrock server does here and what keeps a recipe readable against the item registry.
 *
 * This is the legacy form, not the docs' `RecipeIngredient` (a `Descriptor Type` uint8 and a
 * `StackSize` uint16, which belongs to the auto-craft action inside an `ItemStackRequest`).
 * The shaped recipes in `0x34.bin` at both protocols carry the legacy form, so the capture
 * proves it, and `CraftingDataPacket.test.ts` round trips it.
 *
 * A `molang` descriptor keeps the raw `MolangVersion` int16 it came with. The enum was
 * renumbered between 1.26.50 and 1.26.60 (`Invalid` 0 to -1, `Latest` 15 to 13), so a caller
 * that builds one has to pick the number for the protocol it writes to. Nothing here does, and
 * the capture carries none.
 */
const recipeIngredient: WireType<RecipeIngredientData> = t.custom(
    'RecipeIngredient',
    (stream, value) => {
        if (value.descriptor === null) {
            t.varuint32.write(stream, VARIANT_INVALID);
            t.varint32.write(stream, ANY_META);
            t.varint32.write(stream, value.count);
            return;
        }

        t.varuint32.write(stream, VARIANT_DEFAULT);

        switch (value.descriptor.kind) {
            case 'name':
                t.string.write(stream, NAME_ITEM);
                t.string.write(stream, value.descriptor.name);
                // The aux value, a varint32 in this form rather than the two fixed bytes 748
                // had. The short form leaves every ingredient after the first a byte out.
                t.varint32.write(stream, value.descriptor.meta);
                break;

            case 'molang':
                t.string.write(stream, NAME_MOLANG);
                t.string.write(stream, value.descriptor.expression);
                t.li16.write(stream, value.descriptor.version);
                break;

            case 'tag':
                t.string.write(stream, NAME_TAG);
                t.string.write(stream, value.descriptor.tag);
                t.varint32.write(stream, ANY_META);
                break;
        }

        t.varint32.write(stream, value.count);
    },
    (stream) => {
        const variant = t.varuint32.read(stream);

        if (variant === VARIANT_INVALID) {
            t.varint32.read(stream); // The wildcard meta, which is all an invalid descriptor carries.
            return { descriptor: null, count: t.varint32.read(stream) };
        }

        if (variant !== VARIANT_DEFAULT) {
            throw new Error(`Unknown recipe ingredient descriptor variant ${variant}`);
        }

        let descriptor: IngredientDescriptor;
        const name = t.string.read(stream);
        switch (name) {
            case NAME_ITEM:
                descriptor = { kind: 'name', name: t.string.read(stream), meta: t.varint32.read(stream) };
                break;

            case NAME_MOLANG:
                descriptor = { kind: 'molang', expression: t.string.read(stream), version: t.li16.read(stream) };
                break;

            case NAME_TAG:
                descriptor = { kind: 'tag', tag: t.string.read(stream) };
                t.varint32.read(stream); // The wildcard meta.
                break;

            default:
                throw new Error(`Unknown recipe ingredient descriptor ${name}`);
        }

        return { descriptor, count: t.varint32.read(stream) };
    }
);

/**
 * An `ItemStack`, the form that carries no stack net id - nothing is tracking these stacks.
 *
 * The id is a varint32 and so is the block runtime id. An empty stack writes zero for every
 * field after the id, including a zero length user data blob, whatever the payload holds.
 */
const itemStack: WireType<ItemStackData> = t.custom(
    'ItemStack',
    (stream, value) => {
        const empty = value.runtimeId === 0;

        t.varint32.write(stream, value.runtimeId);
        t.lu16.write(stream, empty ? 0 : value.count);
        t.varuint32.write(stream, empty ? 0 : value.meta);
        t.varint32.write(stream, empty ? 0 : value.blockRuntimeId);
        t.byteArray.write(stream, empty ? Buffer.alloc(0) : (value.userData ?? Buffer.alloc(0)));
    },
    (stream) => ({
        runtimeId: t.varint32.read(stream),
        count: t.lu16.read(stream),
        meta: t.varuint32.read(stream),
        blockRuntimeId: t.varint32.read(stream),
        userData: t.byteArray.read(stream)
    })
);

/** A counted list read back as a read-only array, the form the payload types use. */
const entries = <T>(of: WireType<T>): WireType<readonly T[]> => t.list(of);

/** The output list, in the form that carries no stack id. */
const outputs = entries(itemStack);

/**
 * What has to be done before a recipe appears in the book.
 *
 * An optional, so it opens with a byte saying whether anything follows at all. Inside it, a
 * context and then an optional list of unlocking ingredients, which the page says is populated
 * only under `NONE`. The real server writes it present and empty under `NONE`, so the list is
 * read whatever the context says.
 */
const unlockingRequirement = t.optional(
    t.record({
        context: t.enumOf<RecipeUnlockingContext>(t.varint32),
        ingredients: t.optional(entries(recipeIngredient))
    })
);

/** Every recipe this packet builds from data that names no requirement is available from the start. */
const ALWAYS_UNLOCKED: UnlockingRequirement = {
    context: RecipeUnlockingContext.ALWAYS_UNLOCKED,
    ingredients: null
};

const unlockingOf = (recipe: CraftingRecipeBase): UnlockingRequirement | null =>
    recipe.unlocking === undefined ? ALWAYS_UNLOCKED : recipe.unlocking;

const shapelessHead = t.record({
    id: t.string,
    ingredients: entries(recipeIngredient),
    outputs
});
const stationAndPriority = t.record({ station: t.string, priority: t.varint32 });

/** A shapeless recipe: no type id, the list it sits in is its type. */
const shapelessRecipe: WireType<ShapelessRecipe> = t.custom(
    'ShapelessRecipe',
    (stream, value) => {
        shapelessHead.write(stream, value);
        uuid.write(stream, value.uuid ?? recipeUuidFor(value.id));
        stationAndPriority.write(stream, value);
        unlockingRequirement.write(stream, unlockingOf(value));
        t.varuint32.write(stream, value.netId);
    },
    (stream) => {
        const head = shapelessHead.read(stream);
        const recipeUuid = uuid.read(stream);
        const tail = stationAndPriority.read(stream);
        const unlocking = unlockingRequirement.read(stream);
        return { ...head, uuid: recipeUuid, ...tail, unlocking, netId: t.varuint32.read(stream) };
    }
);

const shapedHead = t.record({
    id: t.string,
    width: t.varint32,
    height: t.varint32,
    // The pattern is a counted list now, where 748 left the reader to work out its length from
    // the width and the height. Both are still sent, and the client checks that they agree: a
    // count that is not width times height is rejected outright.
    pattern: entries(recipeIngredient),
    outputs
});

/** A shaped recipe: no type id, the list it sits in is its type. */
const shapedRecipe: WireType<ShapedRecipe> = t.custom(
    'ShapedRecipe',
    (stream, value) => {
        shapedHead.write(stream, value);
        uuid.write(stream, value.uuid ?? recipeUuidFor(value.id));
        stationAndPriority.write(stream, value);
        t.bool.write(stream, value.symmetric);
        unlockingRequirement.write(stream, unlockingOf(value));
        t.varuint32.write(stream, value.netId);
    },
    (stream) => {
        const head = shapedHead.read(stream);
        const recipeUuid = uuid.read(stream);
        const tail = stationAndPriority.read(stream);
        const symmetric = t.bool.read(stream);
        const unlocking = unlockingRequirement.read(stream);
        return { ...head, uuid: recipeUuid, ...tail, symmetric, unlocking, netId: t.varuint32.read(stream) };
    }
);

/** A multi recipe: a UUID the client matches against the behavior it has compiled in, and a net id. */
const multiRecipe: WireType<MultiRecipe> = t.record({ uuid, netId: t.varuint32 });

/** A smithing transform recipe: three ingredients, the result, the station and the net id. */
const smithingTransformRecipe: WireType<SmithingTransformRecipe> = t.record({
    id: t.string,
    template: recipeIngredient,
    base: recipeIngredient,
    addition: recipeIngredient,
    output: itemStack,
    station: t.string,
    netId: t.varuint32
});

/** A smithing trim recipe: three ingredients, the station and the net id. */
const smithingTrimRecipe: WireType<SmithingTrimRecipe> = t.record({
    id: t.string,
    template: recipeIngredient,
    base: recipeIngredient,
    addition: recipeIngredient,
    station: t.string,
    netId: t.varuint32
});

/** A brewing stand recipe: six varint32. */
const potionMix: WireType<PotionMix> = t.record({
    inputId: t.varint32,
    inputMeta: t.varint32,
    reagentId: t.varint32,
    reagentMeta: t.varint32,
    outputId: t.varint32,
    outputMeta: t.varint32
});

/** A brewing stand container recipe: three varint32. */
const containerMix: WireType<ContainerMix> = t.record({
    fromItemId: t.varint32,
    reagentItemId: t.varint32,
    toItemId: t.varint32
});

/** A material reducer: the packed input key and the list of what it reduces to. */
const materialReducer: WireType<MaterialReducer> = t.record({
    fromItemKey: t.varint32,
    outputs: entries(t.record({ itemId: t.varint32, itemCount: t.varint32 }))
});

/** The fields sent when the client is given its recipes, in wire order. */
export const craftingDataPacket = definePacket('CraftingDataPacket', {
    /** `Shaped Recipes`. */
    shaped: entries(shapedRecipe),
    /** `Shapeless Recipes`. */
    shapeless: entries(shapelessRecipe),
    /** `Multi Recipes`. */
    multi: entries(multiRecipe),
    /** `User Data Shapeless Recipes`. */
    userDataShapeless: entries(shapelessRecipe),
    /** `Shapeless Chemistry Recipes`. */
    shapelessChemistry: entries(shapelessRecipe),
    /** `Shaped Chemistry Recipes`. */
    shapedChemistry: entries(shapedRecipe),
    /** `Smithing Transform Recipes`. */
    smithingTransform: entries(smithingTransformRecipe),
    /** `Smithing Trim Recipes`. */
    smithingTrim: entries(smithingTrimRecipe),
    /** `Potion Mixes`. */
    potionMixes: entries(potionMix),
    /** `Container Mixes`. */
    containerMixes: entries(containerMix),
    /** `Material Reducers`. */
    materialReducers: entries(materialReducer),
    /** `Clear Recipes`: whether the client should throw away the recipes it already had. */
    cleanRecipes: t.bool
});

/** Payload carried by `CraftingDataPacket`. */
export type CraftingDataPayload = PayloadOf<typeof craftingDataPacket>;
