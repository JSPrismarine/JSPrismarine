import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { ActorSyncMessage, updateBlockSyncedPacket } from '../wire/definitions/updateBlockSynced';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { UpdateBlockSyncedPayload } from '../wire/definitions/updateBlockSynced';

export { ActorSyncMessage };

/** A block update paired with the moving actor that changes into or out of it. */
export type UpdateBlockSynced = UpdateBlockSyncedPayload;

/**
 * Synchronizes a moving block actor with a block change at the same position.
 *
 * Protocol 2193 layout: `Block Position` as three ZigZag varint32 values, then `Block Runtime
 * ID`, `Flags`, and `Layer` as varuint32 values, `Unique Actor Id` as a varuint64, and
 * `Actor Sync Message` as a varuint64. The actor message distinguishes a block becoming an
 * actor from an actor becoming a block.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/update-block-synced-packet/
 */
export default class UpdateBlockSyncedPacket extends NetworkPacket<UpdateBlockSynced> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'UpdateBlockSyncedPacket';
    }

    public get id(): number {
        return PacketIdentifier.UPDATE_BLOCK_SYNCED;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: UpdateBlockSynced): void {
        layoutAt(updateBlockSyncedPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): UpdateBlockSynced {
        return layoutAt(updateBlockSyncedPacket, this.codecProtocol).decode(stream);
    }
}
