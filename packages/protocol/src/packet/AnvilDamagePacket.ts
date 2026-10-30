import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** A request to damage the anvil at one block position. */
export interface AnvilDamage {
    /** The anvil position, encoded as three ZigZag varint32 coordinates. */
    blockPosition: BlockPos;
}

/**
 * The client asks for an anvil to be damaged after using it. This packet is sent when the
 * server has disabled the Item Stack Net Manager.
 *
 * Protocol 2193 layout: `Block Position` as a {@link BlockPos}.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/anvil-damage-packet/
 */
export default class AnvilDamagePacket extends NetworkPacket<AnvilDamage> {
    public get id(): number {
        return PacketIdentifier.ANVIL_DAMAGE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: AnvilDamage): void {
        data.blockPosition.serialize(stream);
    }

    protected deserializePayload(stream: NetworkBinaryStream): AnvilDamage {
        const blockPosition = new BlockPos(0, 0, 0);
        blockPosition.deserialize(stream);
        return { blockPosition };
    }
}
