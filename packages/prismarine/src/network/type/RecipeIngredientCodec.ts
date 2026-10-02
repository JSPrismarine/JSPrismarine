import type BinaryStream from '@jsprismarine/binaryutils';
import type { IngredientDescriptor, RecipeIngredient } from '../../crafting/RecipeIngredient';
import { NetworkUtil } from '../NetworkUtil';

/**
 * Which alternative of the descriptor variant is on the wire.
 *
 * Only two are ever selected, and that is not a simplification here - it is what the format
 * does. Everything that is not the invalid descriptor selects `DEFAULT`, and the *name string*
 * that follows says which of the three real shapes it actually is. Mojang's documentation
 * describes the old byte-tagged union and does not mention the string at all.
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
 * descriptor both stand for. It is written *after* the tag's name, not before it.
 */
const ANY_AUX = 32767;

/** An ingredient as it travels: what identifies it, and how many are wanted. */
export interface WireIngredient {
    descriptor: IngredientDescriptor | null;
    count: number;
}

/**
 * Reads and writes a recipe ingredient.
 *
 * Both halves live here on purpose. They are one format described twice, and the last time
 * this codebase described a format twice - the item stack, once for reading and once for
 * writing - the two drifted by a byte and the client rejected the packet.
 */

/**
 * Writes one ingredient.
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
            // A varint at this version, where 748 had two fixed bytes. Writing the short
            // form leaves every ingredient after the first one byte out of place.
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
 * Reads one ingredient.
 *
 * Every shape is read, including the ones nothing here produces: an unread shape does not
 * cost that ingredient, it costs the rest of the packet.
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
            NetworkUtil.readString(stream); // The expression.
            stream.readShortLE(); // The MoLang version.
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
