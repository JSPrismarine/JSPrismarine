import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { changeDimensionPacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../wire/WireLayout';
import type { PayloadOf } from '../wire/define';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The target dimension and position, respawn flag, and optional loading screen id. */
export type ChangeDimensionPayload = PayloadOf<typeof changeDimensionPacket>;

/**
 * Starts a dimension change and the loading screen that goes with it.
 *
 * The payload carries `Dimension ID` as a ZigZag varint32, `Position` as a `Vector3` of
 * three little-endian floats, `Respawn` as a boolean, and an optional `Loading Screen Id` as a
 * presence byte and little-endian uint32. When present, that id links progress updates in
 * `ServerboundLoadingScreenPacket` to this screen. The destination dimension must differ from
 * the client's current dimension; sending the current one leaves the client on the change screen.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/change-dimension-packet/
 */
export default class ChangeDimensionPacket extends NetworkPacket<ChangeDimensionPayload> {
    public get id(): number {
        return PacketIdentifier.CHANGE_DIMENSION;
    }

    public constructor(packetData?: ChangeDimensionPayload | Buffer | null, buffer?: Buffer) {
        super(
            Buffer.isBuffer(packetData) ? null : (packetData ?? null),
            Buffer.isBuffer(packetData) ? packetData : buffer
        );
    }

    protected serializePayload(stream: NetworkBinaryStream, data: ChangeDimensionPayload): void {
        layoutAt(changeDimensionPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): ChangeDimensionPayload {
        return layoutAt(changeDimensionPacket, this.codecProtocol).decode(stream);
    }
}
