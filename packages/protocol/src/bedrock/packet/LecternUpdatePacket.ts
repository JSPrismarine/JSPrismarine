import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { lecternUpdatePacket } from '../wire/definitions/lecternUpdate';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { LecternUpdate } from '../wire/definitions/lecternUpdate';

export type { LecternUpdate };

/**
 * The client tells the server which page to display on a lectern.
 *
 * Protocols 2193 and 2225 share one layout: `New page to show` (uint8), `Total Pages` (uint8),
 * then `Position of Lectern to update` as three ZigZag varint32 coordinates.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/lectern-update-packet/
 */
export default class LecternUpdatePacket extends NetworkPacket<LecternUpdate> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'LecternUpdatePacket';
    }

    public get id(): number {
        return PacketIdentifier.LECTERN_UPDATE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: LecternUpdate): void {
        layoutAt(lecternUpdatePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): LecternUpdate {
        return layoutAt(lecternUpdatePacket, this.codecProtocol).decode(stream);
    }
}
