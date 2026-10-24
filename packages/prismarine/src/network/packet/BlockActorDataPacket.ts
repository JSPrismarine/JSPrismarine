import { ByteOrder, NBTReader, NBTTagCompound, NBTWriter } from '@jsprismarine/nbt';
import BlockPosition from '../../world/BlockPosition';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Replaces the user data of one block actor, such as a chest, a sign, or a beehive.
 *
 * **Bound To:** Client
 *
 * The compound is the whole state of the block actor, not the part that changed, and the
 * client drops the packet when no block actor stands at Block Position.
 *
 * Protocol 2193 layout (docs id 56), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Block Position | BlockPos | Three ZigZag varint32 |
 * | Actor Data Tags | compound | Network NBT: little endian with varint lengths, empty root name |
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/block-actor-data-packet/
 */
export default class BlockActorDataPacket extends DataPacket {
    public static NetID = Identifiers.BlockActorDataPacket;

    /** Block Position, the block the actor sits in. */
    public blockPosition: BlockPosition = new BlockPosition(0, 0, 0);

    /** Actor Data Tags, the block actor's complete user data. */
    public actorDataTags: NBTTagCompound = new NBTTagCompound();

    /** Reads the position and the network NBT compound that follows it. */
    public decodePayload(): void {
        this.blockPosition = NetworkUtil.readBlockPosition(this);

        const reader = new NBTReader(this, ByteOrder.LITTLE_ENDIAN);
        reader.setUseVarint(true);
        this.actorDataTags = reader.parse();
    }

    /**
     * Writes the position and the network NBT compound that follows it.
     *
     * The root is written under an empty name whatever the compound calls itself. A vanilla
     * compound has no name of its own, so the server always sends an empty one, and a block
     * entity loaded from a world file may carry one.
     */
    public encodePayload(): void {
        NetworkUtil.writeBlockPosition(this, this.blockPosition);

        const writer = new NBTWriter(this, ByteOrder.LITTLE_ENDIAN);
        writer.setUseVarint(true);
        writer.writeCompound(unnamed(this.actorDataTags));
    }
}

/** The same tags under an empty root name, without touching the caller's compound. */
const unnamed = (tags: NBTTagCompound): NBTTagCompound => {
    if (!tags.getName()) return tags;

    const root = new NBTTagCompound('');
    for (const [name, value] of tags.children) root.children.set(name, value);
    return root;
};
