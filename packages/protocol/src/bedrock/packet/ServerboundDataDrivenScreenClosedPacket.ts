import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import {
    DataDrivenScreenClosedReason,
    serverboundDataDrivenScreenClosedPacket
} from '../wire/definitions/serverboundDataDrivenScreenClosed';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { ServerboundDataDrivenScreenClosedPayload } from '../wire/definitions/serverboundDataDrivenScreenClosed';

export { DataDrivenScreenClosedReason };

/** The fields of a `ServerboundDataDrivenScreenClosedPacket`, in wire order. */
export type ServerboundDataDrivenScreenClosed = ServerboundDataDrivenScreenClosedPayload;

/**
 * The client's report that a data-driven UI screen closed, whether the server asked for it
 * or the player dismissed it.
 *
 * Protocol 2193 and 2225 share one layout, in wire order: `FormId` as a little-endian uint32, then
 * `CloseReason` as a string (a varuint32 byte length followed by UTF-8) holding a
 * lowercase {@link DataDrivenScreenClosedReason} member name.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/serverbound-data-driven-screen-closed-packet/
 * @throws When the `CloseReason` string is not a member the schema lists.
 */
export default class ServerboundDataDrivenScreenClosedPacket extends NetworkPacket<ServerboundDataDrivenScreenClosed> {
    public get id(): number {
        return PacketIdentifier.SERVERBOUND_DATA_DRIVEN_SCREEN_CLOSED;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ServerboundDataDrivenScreenClosed): void {
        layoutAt(serverboundDataDrivenScreenClosedPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ServerboundDataDrivenScreenClosed {
        return layoutAt(serverboundDataDrivenScreenClosedPacket, this.codecProtocol).decode(stream);
    }
}
