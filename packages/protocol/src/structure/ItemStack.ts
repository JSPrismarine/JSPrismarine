import type NetworkBinaryStream from '../NetworkBinaryStream';
import NetworkStructure from '../NetworkStructure';

/** One item stack, in the plain form a payload carries it. */
export interface ItemStackData {
    /** `Item Id` from the item registry, or `0` for an empty stack. */
    runtimeId: number;
    /** `Stack size`. */
    count: number;
    /** `Aux value`: the damage or the variant. */
    meta: number;
    /** The hashed runtime id of the block the item places, or `0` when it places none. */
    blockRuntimeId: number;
    /** `User Data Buffer`, a serialized `ItemInstanceUserData`. Empty when absent. */
    userData?: Buffer;
}

/**
 * An item stack in the form that carries no stack net id - the docs' `ItemStack`.
 *
 * The creative menu and every recipe use it, because nothing is tracking these stacks. It
 * differs from {@link NetworkItemStackDescriptor} in two ways and not only in the missing
 * `Net Id Variant`: the id is a varint32 here rather than two fixed bytes, and so is the
 * block runtime id.
 *
 * Wire layout: `Id` (varint32), `Stack size` (uint16 little endian), `Aux value` (varuint32),
 * `Block Runtime Id` (varint32), then `User Data Buffer` (a varuint32 length and the bytes).
 * An empty stack writes zero for every field after the id, including a zero length blob.
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/network-item-stack-descriptor/}
 */
export default class ItemStack extends NetworkStructure {
    /** `User Data Buffer`, a serialized `ItemInstanceUserData`. */
    public userData: Buffer;

    /**
     * Creates a stack.
     * @param runtimeId - `Id`, or `0` for an empty stack.
     * @param count - `Stack size`.
     * @param meta - `Aux value`.
     * @param blockRuntimeId - `Block Runtime Id`, or `0` when the item places no block.
     * @param userData - `User Data Buffer`; an empty buffer when the stack carries none.
     */
    public constructor(
        public runtimeId = 0,
        public count = 0,
        public meta = 0,
        public blockRuntimeId = 0,
        userData: Buffer = Buffer.alloc(0)
    ) {
        super();
        this.userData = userData;
    }

    /** Builds a stack from the plain form, filling in the empty blob. */
    public static from(stack: ItemStackData): ItemStack {
        return new ItemStack(stack.runtimeId, stack.count, stack.meta, stack.blockRuntimeId, stack.userData);
    }

    /** The plain form, for a payload. */
    public toData(): ItemStackData {
        return {
            runtimeId: this.runtimeId,
            count: this.count,
            meta: this.meta,
            blockRuntimeId: this.blockRuntimeId,
            userData: this.userData
        };
    }

    /** Writes the stack in docs order. An empty stack writes zeroes for every field after the id. */
    public serialize(stream: NetworkBinaryStream): void {
        const empty = this.runtimeId === 0;

        stream.writeVarInt(this.runtimeId);
        stream.writeUnsignedShortLE(empty ? 0 : this.count);
        stream.writeUnsignedVarInt(empty ? 0 : this.meta);
        stream.writeVarInt(empty ? 0 : this.blockRuntimeId);
        stream.writeLengthPrefixed(empty ? Buffer.alloc(0) : this.userData);
    }

    /** Reads the stack in docs order. The user data blob is kept as bytes, not parsed. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.runtimeId = stream.readVarInt();
        this.count = stream.readUnsignedShortLE();
        this.meta = stream.readUnsignedVarInt();
        this.blockRuntimeId = stream.readVarInt();
        this.userData = stream.readLengthPrefixed();
    }
}
