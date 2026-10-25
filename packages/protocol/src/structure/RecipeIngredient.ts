import type NetworkBinaryStream from '../NetworkBinaryStream';
import NetworkStructure from '../NetworkStructure';

/**
 * Which alternative of the `Item Descriptor` variant is on the wire.
 *
 * `CraftingDataPacket` carries the legacy form of a recipe ingredient, where only these two
 * selectors are ever written: the invalid descriptor selects `INVALID` and all three real
 * shapes select `DEFAULT`, with the name string that follows saying which of the three it is.
 *
 * The docs type page for `recipe-ingredient` describes a different encoding, a `Descriptor
 * Type` uint8 of 0 Empty, 1 ItemName, 2 Molang, 3 ItemTag followed by a `StackSize` uint16.
 * That encoding is real, but it belongs to the auto-craft action inside an `ItemStackRequest`.
 * gophertunnel at protocol 2193 keeps the two apart the same way: `Writer.ItemDescriptorCount`
 * writes the legacy form used here and is what every recipe in `crafting_data.go` goes
 * through, while `StackRequestItemDescriptorCount` writes the type byte form.
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
 * 32767 is the wildcard meta, "any", which is what an invalid descriptor and a tag descriptor
 * both stand for. An invalid descriptor writes it in place of a name; a tag descriptor writes
 * it after the tag's name.
 */
export const ANY_META = 32767;

/** What one slot accepts: a named item with an aux value, or a Bedrock item tag. */
export type IngredientDescriptor = { kind: 'name'; name: string; meta: number } | { kind: 'tag'; tag: string };

/** One slot, in the plain form a payload carries it. */
export interface RecipeIngredientData {
    /** Null for the empty slot of a shaped pattern, which still has to be written. */
    descriptor: IngredientDescriptor | null;
    /** The stack size, a varint32 in this form rather than the docs' `StackSize` uint16. */
    count: number;
}

/**
 * One ingredient slot of a recipe: the variant selector, the descriptor's name and fields,
 * then the count.
 *
 * A named ingredient goes out under `name` rather than by numeric id, which is what every
 * Bedrock server does here and what keeps a recipe readable against the item registry.
 */
export default class RecipeIngredient extends NetworkStructure {
    /**
     * Creates a slot.
     * @param descriptor - What the slot accepts, or null for an empty slot.
     * @param count - The stack size.
     */
    public constructor(
        public descriptor: IngredientDescriptor | null = null,
        public count = 0
    ) {
        super();
    }

    /** Builds a slot from the plain form. */
    public static from(ingredient: RecipeIngredientData): RecipeIngredient {
        return new RecipeIngredient(ingredient.descriptor, ingredient.count);
    }

    /** The plain form, for a payload. */
    public toData(): RecipeIngredientData {
        return { descriptor: this.descriptor, count: this.count };
    }

    /** Writes the selector, the descriptor and the count. */
    public serialize(stream: NetworkBinaryStream): void {
        if (this.descriptor === null) {
            stream.writeUnsignedVarInt(VARIANT_INVALID);
            stream.writeVarInt(ANY_META);
            stream.writeVarInt(this.count);
            return;
        }

        stream.writeUnsignedVarInt(VARIANT_DEFAULT);

        switch (this.descriptor.kind) {
            case 'name':
                stream.writeString(NAME_ITEM);
                stream.writeString(this.descriptor.name);
                // The aux value, a varint32 in this form rather than the two fixed bytes 748
                // had. The short form leaves every ingredient after the first a byte out.
                stream.writeVarInt(this.descriptor.meta);
                break;

            case 'tag':
                stream.writeString(NAME_TAG);
                stream.writeString(this.descriptor.tag);
                stream.writeVarInt(ANY_META);
                break;
        }

        stream.writeVarInt(this.count);
    }

    /**
     * Reads one slot, the mirror of {@link serialize}.
     *
     * Every shape is read, including the ones nothing here produces: an unread shape does not
     * cost that ingredient, it costs the rest of the packet. A `molang` descriptor is stepped
     * over rather than returned, because {@link IngredientDescriptor} has no molang kind.
     * @throws {Error} When the variant or the descriptor name is one this does not know, since
     * either leaves the stream at an offset nothing after it can be read from.
     */
    public deserialize(stream: NetworkBinaryStream): void {
        const variant = stream.readUnsignedVarInt();
        this.descriptor = null;

        if (variant === VARIANT_INVALID) {
            stream.readVarInt(); // The wildcard meta, which is all an invalid descriptor carries.
            this.count = stream.readVarInt();
            return;
        }

        if (variant !== VARIANT_DEFAULT) {
            throw new Error(`Unknown recipe ingredient descriptor variant ${variant}`);
        }

        const name = stream.readString();
        switch (name) {
            case NAME_ITEM:
                this.descriptor = { kind: 'name', name: stream.readString(), meta: stream.readVarInt() };
                break;

            case NAME_MOLANG:
                stream.readString(); // Tag Expression.
                stream.readShortLE(); // Molang Version, an int16.
                break;

            case NAME_TAG:
                this.descriptor = { kind: 'tag', tag: stream.readString() };
                stream.readVarInt(); // The wildcard meta.
                break;

            default:
                throw new Error(`Unknown recipe ingredient descriptor ${name}`);
        }

        this.count = stream.readVarInt();
    }
}
