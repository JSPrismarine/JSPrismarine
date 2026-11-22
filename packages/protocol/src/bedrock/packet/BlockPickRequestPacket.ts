import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { blockPickRequestPacket } from '../wire/definitions/blockPickRequest';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { BlockPickRequestPayload } from '../wire/definitions/blockPickRequest';

/** The position and hotbar state the client sends when it picks a block. */
export type BlockPickRequest = BlockPickRequestPayload;

/**
 * Sent when a player picks up a block in the world. The request names the block, says whether
 * to copy its data, and reports the client's empty hotbar slots.
 *
 * Layout at protocols 2193 and 2225, which agree: `Position` as a BlockPos, `With Data?` as a boolean, then
 * `Max Slots` as a uint8.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/block-pick-request-packet/
 */
export default class BlockPickRequestPacket extends NetworkPacket<BlockPickRequest> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'BlockPickRequestPacket';
    }

    public get id(): number {
        return PacketIdentifier.BLOCK_PICK_REQUEST;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: BlockPickRequest): void {
        layoutAt(blockPickRequestPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): BlockPickRequest {
        return layoutAt(blockPickRequestPacket, this.codecProtocol).decode(stream);
    }
}
