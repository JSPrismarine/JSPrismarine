import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/** The optional parts of a stack descriptor. */
export interface NetworkItemStackDescriptorConfig {
    /** `Net Id Variant`, written only when `includeNetid` is true. */
    netIdVariant?: number;
    /** `User Data Buffer`, a serialized `ItemInstanceUserData`. Defaults to an empty blob. */
    userDataBuffer?: Buffer;
}

/**
 * An item stack as an inventory, an equipped hand or a transaction carries it.
 *
 * Wire layout, in docs order: `Id` (int16 little endian, `0` for an empty stack), `Stack size`
 * (uint16 little endian), `Aux value` (varuint32), `Net Id Variant` (optional: a boolean,
 * then a varint32 when true), `Block Runtime Id` (varuint32) and `User Data Buffer` (a
 * varuint32 length, then the `ItemInstanceUserData` bytes).
 * {@link https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/network-item-stack-descriptor/}
 */
export default class NetworkItemStackDescriptor extends NetworkStructure {
    /** `Net Id Variant`, meaningful only when `includeNetid` is true. */
    public netIdVariant: number;
    /** `User Data Buffer`, a serialized `ItemInstanceUserData`. */
    public userDataBuffer: Buffer;

    /**
     * The id of the empty stack.
     *
     * It no longer ends the structure. Up to 748 a zero id was the whole descriptor and
     * everything after it was skipped; at 2168 every field is written whatever the id is, and
     * only the user data blob shrinks to a bare zero length. An empty slot is eight bytes now,
     * not one - and since most of an inventory is empty slots, a reader that still stops here
     * is misaligned almost immediately.
     */
    private readonly INVALID_ITEM_STACK_ID = 0;

    /**
     * Creates a descriptor.
     * @param id - `Id`, the item's network id, or `0` for an empty stack.
     * @param stackSize - `Stack size`.
     * @param auxValue - `Aux value`, the item's metadata.
     * @param includeNetid - Whether `Net Id Variant` is present.
     * @param blockRuntimeId - `Block Runtime Id`, or `0` when the item places no block.
     * @param config - The net id variant and the user data blob.
     */
    public constructor(
        public id: number,
        public stackSize: number,
        public auxValue: number,
        public includeNetid: boolean,
        public blockRuntimeId: number,
        config: NetworkItemStackDescriptorConfig = {}
    ) {
        super();
        this.netIdVariant = config.netIdVariant ?? 0;
        this.userDataBuffer = config.userDataBuffer ?? Buffer.alloc(0);
    }

    /** Writes the descriptor in docs order. An empty stack writes zeroes for every field after the id. */
    public serialize(stream: NetworkBinaryStream): void {
        const empty = this.id === this.INVALID_ITEM_STACK_ID;

        // Two fixed bytes, not a varint. The untracked form of the same stack still uses a
        // varint here, which is the one difference between them that is not the flag.
        stream.writeShortLE(this.id);
        stream.writeUnsignedShortLE(empty ? 0 : this.stackSize);
        stream.writeUnsignedVarInt(empty ? 0 : this.auxValue);

        stream.writeBoolean(this.includeNetid);
        if (this.includeNetid) {
            stream.writeVarInt(this.netIdVariant);
        }

        stream.writeUnsignedVarInt(empty ? 0 : this.blockRuntimeId);
        stream.writeLengthPrefixed(empty ? Buffer.alloc(0) : this.userDataBuffer);
    }

    /** Reads the descriptor in docs order. The user data blob is kept as bytes, not parsed. */
    public deserialize(stream: NetworkBinaryStream): void {
        this.id = stream.readShortLE();
        this.stackSize = stream.readUnsignedShortLE();
        this.auxValue = stream.readUnsignedVarInt();

        this.includeNetid = stream.readBoolean();
        if (this.includeNetid) {
            this.netIdVariant = stream.readVarInt();
        }

        this.blockRuntimeId = stream.readUnsignedVarInt();
        this.userDataBuffer = stream.readLengthPrefixed();
    }
}
