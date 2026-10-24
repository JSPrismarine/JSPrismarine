import { ByteOrder, NBTTagCompound } from '@jsprismarine/nbt';
import type { NetworkBinaryStream } from '../';
import NetworkStructure from '../NetworkStructure';

/** The optional parts of an item's user data. */
export interface ItemInstanceUserDataConfig {
    /** Block names the item may be placed on, such as `minecraft:stone`. */
    canPlaceOnBlocks?: Array<string>;
    /** Block names the item may break. */
    canDestroyBlocks?: Array<string>;
    /** The tick a shield started blocking on. Only a shield carries one. */
    blockingTick?: bigint;
}

/** The marker that says a compound follows. */
const TAG_FOLLOWS = -1;
/** The marker that says no compound follows. */
const NO_TAG = 0;
/** The only user data version the client writes or accepts. */
const USER_DATA_VERSION = 1;

/**
 * The blob a `NetworkItemStackDescriptor` carries as its `User Data Buffer`: the item's NBT
 * and its can-place-on and can-destroy lists.
 *
 * Wire layout, after gophertunnel's `itemUserData` since the docs do not describe this type:
 * a marker (int16 little endian) that is `-1` when a compound follows and `0` otherwise. After
 * `-1` come one version byte (`1`) and the compound as plain little-endian NBT, without
 * varints. Then `Can Place On` and `Can Destroy`, each a uint32 little-endian count followed by
 * strings with an int16 little-endian length. A shield ends with its `Blocking Tick` (int64
 * little endian); nothing on the wire says whether it is there, so the reader has to be told.
 * {@link https://mojang.github.io/bedrock-protocol-docs/html/ItemInstanceUserData.html}
 */
export default class ItemInstanceUserData extends NetworkStructure {
    /** Block names the item may be placed on. */
    public canPlaceOnBlocks: Array<string>;
    /** Block names the item may break. */
    public canDestroyBlocks: Array<string>;
    /** The tick a shield started blocking on, or null for every other item. */
    public blockingTick: bigint | null;

    /**
     * Creates the user data.
     * @param userDataTag - The item's compound, or null when it has none. The marker is derived from this.
     * @param config - The block lists and, for a shield, the blocking tick.
     */
    public constructor(
        public userDataTag: NBTTagCompound | null = null,
        config: ItemInstanceUserDataConfig = {}
    ) {
        super();
        this.canPlaceOnBlocks = config.canPlaceOnBlocks ?? [];
        this.canDestroyBlocks = config.canDestroyBlocks ?? [];
        this.blockingTick = config.blockingTick ?? null;
    }

    /** Writes the marker, the compound when there is one, both block lists, and the blocking tick when set. */
    public serialize(stream: NetworkBinaryStream): void {
        if (this.userDataTag === null) {
            stream.writeShortLE(NO_TAG);
        } else {
            stream.writeShortLE(TAG_FOLLOWS);
            stream.writeByte(USER_DATA_VERSION);
            this.userDataTag.writeToStream(stream, ByteOrder.LITTLE_ENDIAN, false);
        }

        ItemInstanceUserData.writeBlockList(stream, this.canPlaceOnBlocks);
        ItemInstanceUserData.writeBlockList(stream, this.canDestroyBlocks);

        if (this.blockingTick !== null) {
            stream.writeLongLE(this.blockingTick);
        }
    }

    /**
     * Reads the user data, replacing whatever the instance held.
     * @param stream - The stream positioned at the marker.
     * @param shield - Whether the item is a shield, so a `Blocking Tick` closes the blob. The
     * caller knows this from the stack's item id; nothing in the blob says so.
     * @throws Error when the marker is neither `0` nor `-1`, or the version byte is not `1`.
     */
    public deserialize(stream: NetworkBinaryStream, shield = false): void {
        const marker = stream.readShortLE();
        if (marker === TAG_FOLLOWS) {
            const version = stream.readByte();
            if (version !== USER_DATA_VERSION) {
                throw new Error(`Item user data version ${version} is not ${USER_DATA_VERSION}`);
            }
            this.userDataTag = NBTTagCompound.readFromStream(stream, ByteOrder.LITTLE_ENDIAN, false);
        } else if (marker === NO_TAG) {
            this.userDataTag = null;
        } else {
            throw new Error(`Item user data marker ${marker} is neither ${NO_TAG} nor ${TAG_FOLLOWS}`);
        }

        this.canPlaceOnBlocks = ItemInstanceUserData.readBlockList(stream);
        this.canDestroyBlocks = ItemInstanceUserData.readBlockList(stream);
        this.blockingTick = shield ? stream.readLongLE() : null;
    }

    private static writeBlockList(stream: NetworkBinaryStream, blocks: Array<string>): void {
        stream.writeUnsignedIntLE(blocks.length);
        for (const block of blocks) {
            const bytes = Buffer.from(block, 'utf-8');
            stream.writeShortLE(bytes.byteLength);
            stream.write(bytes);
        }
    }

    private static readBlockList(stream: NetworkBinaryStream): Array<string> {
        const blocks: Array<string> = [];
        let count = stream.readUnsignedIntLE();
        while (count-- > 0) {
            blocks.push(stream.read(stream.readShortLE()).toString('utf-8'));
        }
        return blocks;
    }
}
