import type BinaryStream from '@jsprismarine/binaryutils';
import type { IngredientDescriptor, RecipeIngredient } from '../../crafting/RecipeIngredient';
import { NetworkUtil } from '../NetworkUtil';

/**
 * Which alternative of the `Item Descriptor` variant is on the wire.
 *
 * `CraftingDataPacket` carries the legacy form of a `RecipeIngredient`, where only these two
 * selectors are ever written: the invalid descriptor selects `INVALID` and all three real
 * shapes select `DEFAULT`, with the name string that follows saying which of the three it is.
 *
 * The docs type page for `recipe-ingredient` describes a different encoding - a
 * `Descriptor Type` uint8 of 0 Empty, 1 ItemName, 2 Molang, 3 ItemTag, followed by a
 * `StackSize` uint16. That encoding is real, but it belongs to the auto-craft action inside
 * an `ItemStackRequest`, which `ItemStackRequest.ts` reads. gophertunnel at protocol 2193
 * keeps the two apart the same way: `Writer.ItemDescriptorCount` writes the legacy form used
 * here and is what every recipe in `crafting_data.go` goes through, while
 * `StackRequestItemDescriptorCount` writes the selector plus type byte form.
 */
const VARIANT_INVALID = 0;
const VARIANT_DEFAULT = 1;

/** The names that pick a shape once `DEFAULT` has been selected. */
const NAME_ITEM = 'name';
const NAME_MOLANG = 'molang';
const NAME_TAG = 'item_tag';

/**
 * The auxiliary value written for a descriptor that names no single item.
 *
 * 32767 is the wildcard meta - "any" - which is what an invalid descriptor and a tag
 * descriptor both stand for. An invalid descriptor writes it in place of a name; a tag
 * descriptor writes it after the tag's name.
 */
const ANY_AUX = 32767;

/** An ingredient as it travels: what identifies it, and how many are wanted. */
export interface WireIngredient {
    /** The `Item Descriptor`, or `null` for the empty slot of a shaped pattern. */
    descriptor: IngredientDescriptor | null;
    /** The stack size, a varint32 in this form rather than the docs' `StackSize` uint16. */
    count: number;
}

/**
 * Writes one ingredient: the variant selector, the descriptor's name and fields, then the count.
 *
 * A named ingredient goes out under `name` rather than by numeric id: the name is what this
 * server reasons in, and the numeric ids are the thing that has already proved inconsistent
 * between data files.
 */
export const writeRecipeIngredient = (stream: BinaryStream, ingredient: RecipeIngredient): void => {
    const descriptor = ingredient.describe();

    stream.writeUnsignedVarInt(VARIANT_DEFAULT);

    switch (descriptor.kind) {
        case 'name':
            NetworkUtil.writeString(stream, NAME_ITEM);
            NetworkUtil.writeString(stream, descriptor.name);
            // The aux value, a varint32 in this form rather than the two fixed bytes 748 had.
            // The short form leaves every ingredient after the first one byte out of place.
            stream.writeVarInt(descriptor.meta);
            break;

        case 'tag':
            NetworkUtil.writeString(stream, NAME_TAG);
            NetworkUtil.writeString(stream, descriptor.tag);
            stream.writeVarInt(ANY_AUX);
            break;
    }

    stream.writeVarInt(ingredient.count);
};

/** Writes the empty slot of a shaped pattern, which is an ingredient of no kind at all. */
export const writeEmptyIngredient = (stream: BinaryStream): void => {
    stream.writeUnsignedVarInt(VARIANT_INVALID);
    stream.writeVarInt(ANY_AUX);
    stream.writeVarInt(0);
};

/**
 * Reads one ingredient, the mirror of {@link writeRecipeIngredient}.
 *
 * Every shape is read, including the ones nothing here produces: an unread shape does not
 * cost that ingredient, it costs the rest of the packet. A `molang` descriptor is stepped
 * over rather than returned, because {@link IngredientDescriptor} has no molang kind - this
 * server never sends one, and nothing it reads back is a recipe it did not send.
 */
export const readRecipeIngredient = (stream: BinaryStream): WireIngredient => {
    const variant = stream.readUnsignedVarInt();
    let descriptor: IngredientDescriptor | null = null;

    if (variant === VARIANT_INVALID) {
        stream.readVarInt(); // The wildcard meta, which is all an invalid descriptor carries.
        return { descriptor, count: stream.readVarInt() };
    }

    if (variant !== VARIANT_DEFAULT) {
        throw new Error(`Unknown recipe ingredient descriptor variant ${variant}`);
    }

    const name = NetworkUtil.readString(stream);
    switch (name) {
        case NAME_ITEM:
            descriptor = { kind: 'name', name: NetworkUtil.readString(stream), meta: stream.readVarInt() };
            break;

        case NAME_MOLANG:
            NetworkUtil.readString(stream); // Tag Expression.
            stream.readShortLE(); // Molang Version, an int16.
            break;

        case NAME_TAG:
            descriptor = { kind: 'tag', tag: NetworkUtil.readString(stream) };
            stream.readVarInt(); // The wildcard meta.
            break;

        default:
            throw new Error(`Unknown recipe ingredient descriptor ${name}`);
    }

    return { descriptor, count: stream.readVarInt() };
};
