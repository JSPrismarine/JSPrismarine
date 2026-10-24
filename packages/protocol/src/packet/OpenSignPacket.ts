import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import BlockPos from '../structure/BlockPos';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The fields of an `OpenSignPacket`, in wire order. */
export interface OpenSign {
    /** `Pos`, the sign block the client should open the editor for. */
    position: BlockPos;
    /** `Is Front Side`: edit the front face of the sign rather than the back. */
    isFrontSide: boolean;
}

/**
 * Tells the client to open the sign editing screen for one sign block.
 *
 * Protocol 2193 layout, in wire order: `Pos` as a {@link BlockPos} (three ZigZag varint32),
 * then `Is Front Side` as one byte. The server sends it after a player interacts with a sign
 * they may edit; the client answers with a `BlockActorData` carrying the new text.
 */
export default class OpenSignPacket extends NetworkPacket<OpenSign> {
    public get id(): number {
        return PacketIdentifier.OPEN_SIGN;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: OpenSign): void {
        data.position.serialize(stream);
        stream.writeBoolean(data.isFrontSide);
    }

    protected deserializePayload(stream: NetworkBinaryStream): OpenSign {
        return {
            position: BlockPos.deserialize(stream),
            isFrontSide: stream.readBoolean()
        };
    }
}
