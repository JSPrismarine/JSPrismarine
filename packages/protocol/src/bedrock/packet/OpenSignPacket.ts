import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { openSignPacket } from '../wire/definitions/openSign';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { OpenSignPayload } from '../wire/definitions/openSign';

/** The fields of an `OpenSignPacket`, in wire order. */
export type OpenSign = OpenSignPayload;

/**
 * Tells the client to open the sign editing screen for one sign block.
 *
 * Protocol 2193 layout, in wire order: `Pos` as a block position (three ZigZag varint32),
 * then `Is Front Side` as one byte. The server sends it after a player interacts with a sign
 * they may edit; the client answers with a `BlockActorData` carrying the new text.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/open-sign-packet/
 */
export default class OpenSignPacket extends NetworkPacket<OpenSign> {
    public get id(): number {
        return PacketIdentifier.OPEN_SIGN;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: OpenSign): void {
        layoutAt(openSignPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): OpenSign {
        return layoutAt(openSignPacket, this.codecProtocol).decode(stream);
    }
}
