/**
 * `NetworkItemStackDescriptor` as the fields on the wire, with nothing resolved.
 *
 * An inventory, an equipped hand and a transaction all carry a stack in this form. What the
 * numbers mean - which item an id names, what the user data blob holds - is the server's
 * business; this module's business is the bytes, so a descriptor read here writes back out
 * byte for byte whatever the sender put in it.
 *
 * The structure class `structure/NetworkItemStackDescriptor.ts` describes the same layout for
 * the `NetworkStructure` consumers. This pair is the one the declarative field lists use.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/network-item-stack-descriptor/}
 */
import type BinaryStream from '@jsprismarine/binaryutils';

/** The id of the empty stack. Every field after it is still written. */
export const EMPTY_ITEM_STACK_ID = 0;

/** One item stack's six wire fields. */
export interface ItemStackDescriptorData {
    /** `Id`, a little-endian int16. `0` is the empty stack. */
    id: number;
    /** `Stack size`, a little-endian uint16. */
    stackSize: number;
    /** `Aux value`, the stack's metadata, as a varuint32. */
    auxValue: number;
    /** `Net Id Variant`, present only when the sender tracks the stack. */
    stackNetId: number | null;
    /** `Block Runtime Id` of the block this stack places, or `0`. */
    blockRuntimeId: number;
    /** `User Data Buffer`: the `ItemInstanceUserData` bytes, kept as bytes. */
    userData: Buffer;
}

/**
 * Writes a stack descriptor, field for field.
 *
 * Nothing is normalized here. An empty stack that arrived with zeroes in every field after
 * the id goes back out with those zeroes, which is what makes a decode-encode pass identity.
 * @param stream - The stream to append to.
 * @param value - The descriptor to write.
 */
export const writeItemStackDescriptor = (stream: BinaryStream, value: ItemStackDescriptorData): void => {
    // Two fixed bytes, not a varint. The untracked form of the same stack uses a varint here,
    // which is the one difference between them that is not the flag.
    stream.writeShortLE(value.id);
    stream.writeUnsignedShortLE(value.stackSize);
    stream.writeUnsignedVarInt(value.auxValue);

    stream.writeBoolean(value.stackNetId !== null);
    if (value.stackNetId !== null) stream.writeVarInt(value.stackNetId);

    stream.writeUnsignedVarInt(value.blockRuntimeId);
    stream.writeUnsignedVarInt(value.userData.byteLength);
    stream.write(value.userData);
};

/**
 * Reads a stack descriptor, the mirror of {@link writeItemStackDescriptor}.
 *
 * Every field is read whatever the id is. Up to protocol 748 a zero id was the whole
 * descriptor; at 2168 an empty slot is eight bytes, and a reader that still stops at the id
 * is misaligned from the next field onwards.
 * @param stream - The stream positioned at the descriptor's id.
 * @returns The six fields as they were on the wire.
 */
export const readItemStackDescriptor = (stream: BinaryStream): ItemStackDescriptorData => {
    const id = stream.readShortLE();
    const stackSize = stream.readUnsignedShortLE();
    const auxValue = stream.readUnsignedVarInt();
    const stackNetId = stream.readBoolean() ? stream.readVarInt() : null;
    const blockRuntimeId = stream.readUnsignedVarInt();

    return { id, stackSize, auxValue, stackNetId, blockRuntimeId, userData: stream.read(stream.readUnsignedVarInt()) };
};
