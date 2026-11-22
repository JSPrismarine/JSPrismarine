import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { LabTableReactionType, LabTableType, labTablePacket } from '../wire/definitions/labTable';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { LabTablePayload } from '../wire/definitions/labTable';

export { LabTableReactionType, LabTableType };

/** The action, position, and optional reaction carried by a chemistry lab table exchange. */
export type LabTable = LabTablePayload;

/**
 * A client action or server reaction for the Education Edition chemistry lab table.
 *
 * Protocol 2193 and 2225 layout (identical): `Type` (uint8), `Position` (three ZigZag varint32 coordinates),
 * and `Reaction` (uint8). The client sends `StartCombine`; the server can answer with
 * `StartReaction` and a reaction effect.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/lab-table-packet/
 */
export default class LabTablePacket extends NetworkPacket<LabTablePayload> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'LabTablePacket';
    }

    public get id(): number {
        return PacketIdentifier.LAB_TABLE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: LabTablePayload): void {
        layoutAt(labTablePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): LabTablePayload {
        return layoutAt(labTablePacket, this.codecProtocol).decode(stream);
    }
}
