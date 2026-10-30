import { NBTTagCompound } from '@jsprismarine/nbt';
import { blockActorDataPacket, layoutAt } from '@jsprismarine/protocol';

import BlockPosition from '../../world/BlockPosition';
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
    /** Block Position, the block the actor sits in. */
    public blockPosition: BlockPosition = new BlockPosition(0, 0, 0);

    /** Actor Data Tags, the block actor's complete user data. */
    public actorDataTags: NBTTagCompound = new NBTTagCompound();

    /** Reads the position and the network NBT compound that follows it. */
    public decodePayload(): void {
        const read = layoutAt(blockActorDataPacket, this.codecProtocol).decode(this);
        this.blockPosition = new BlockPosition(read.position.x, read.position.y, read.position.z);
        this.actorDataTags = read.actorDataTags;
    }

    /**
     * Writes the position and the network NBT compound that follows it.
     *
     * The root goes out under an empty name whatever the compound calls itself, which the
     * wire type handles: a vanilla compound has no name of its own, and a block entity loaded
     * from a world file may carry one.
     */
    public encodePayload(): void {
        layoutAt(blockActorDataPacket, this.codecProtocol).encode(this, {
            position: {
                x: this.blockPosition.getX(),
                y: this.blockPosition.getY(),
                z: this.blockPosition.getZ()
            },
            actorDataTags: this.actorDataTags
        });
    }
}
