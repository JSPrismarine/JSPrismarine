import { blockActorDataPacket } from '../wire/definitions/blocks';
import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { NBTTagCompound } from '@jsprismarine/nbt';

/** The complete block actor state sent for one block position. */
export interface BlockActorData {
    /** Position of the block actor. */
    blockPosition: BlockPos;
    /** Complete user data compound that replaces the client's block actor state. */
    actorDataTags: NBTTagCompound;
}

/**
 * Sends a block actor's complete user data compound and its block position to the client.
 *
 * Protocol 2193 layout: `Block Position` as three ZigZag varint32 coordinates, followed by
 * `Actor Data Tags`. The reference labels that field unknown; this codec follows the captured
 * layout as little-endian network NBT with varint lengths and an empty root name. The compound
 * is a full replacement, so the client ignores it when no block actor exists at the position.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/block-actor-data-packet/
 */
export default class BlockActorDataPacket extends NetworkPacket<BlockActorData> {
    public get id(): number {
        return PacketIdentifier.BLOCK_ACTOR_DATA;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: BlockActorData): void {
        layoutAt(blockActorDataPacket, this.codecProtocol).encode(stream, {
            position: { x: data.blockPosition.x, y: data.blockPosition.y, z: data.blockPosition.z },
            actorDataTags: data.actorDataTags
        });
    }

    protected deserializePayload(stream: NetworkBinaryStream): BlockActorData {
        const data = layoutAt(blockActorDataPacket, this.codecProtocol).decode(stream);
        return {
            blockPosition: new BlockPos(data.position.x, data.position.y, data.position.z),
            actorDataTags: data.actorDataTags
        };
    }
}
