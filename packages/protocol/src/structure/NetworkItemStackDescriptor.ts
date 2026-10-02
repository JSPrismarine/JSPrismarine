import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

interface NetworkItemStackDescriptorConfig {
    netIdVariant?: number;
    userDataBuffer?: Buffer;
}

/**
 * Represents a network structure of a item stack descriptor.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/NetworkItemStackDescriptor.html}
 */
export default class NetworkItemStackDescriptor extends NetworkStructure {
    public netIdVariant: number;
    public userDataBuffer: Buffer; // serialized ItemInstanceUserData

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
        this.userDataBuffer = config.userDataBuffer = Buffer.allocUnsafe(0);
    }

    public serialize(stream: NetworkBinaryStream): void {
        const empty = this.id === this.INVALID_ITEM_STACK_ID;

        // Two fixed bytes, not a varint. The untracked form of the same stack still uses a
        // varint here, which is the one difference between them that is not the flag.
        stream.writeShortLE(this.id);
        stream.writeUnsignedShortLE(empty ? 0 : this.stackSize);
        stream.writeUnsignedVarInt(empty ? 0 : this.auxValue);

        stream.writeBoolean(this.includeNetid);
        this.includeNetid && stream.writeVarInt(this.netIdVariant);

        stream.writeUnsignedVarInt(empty ? 0 : this.blockRuntimeId);
        stream.writeLengthPrefixed(empty ? Buffer.allocUnsafe(0) : this.userDataBuffer);
    }

    public deserialize(stream: NetworkBinaryStream): void {
        this.id = stream.readShortLE();
        this.stackSize = stream.readUnsignedShortLE();
        this.auxValue = stream.readUnsignedVarInt();

        this.includeNetid = stream.readBoolean();
        this.includeNetid && (this.netIdVariant = stream.readVarInt());

        this.blockRuntimeId = stream.readUnsignedVarInt();
        this.userDataBuffer = stream.readLengthPrefixed();
    }
}
