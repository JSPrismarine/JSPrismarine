import { layoutAt } from '../wire/WireLayout';
import { setTimePacket } from '../wire/definitions/worldStatus';
import type { PayloadOf } from '../wire/define';
import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The `Time` field sent by {@link SetTimePacket}, measured in world ticks. */
export type SetTimePayload = PayloadOf<typeof setTimePacket>;

/**
 * Periodically synchronizes the current world time with the receiving client, including at login.
 *
 * Protocol 2193 carries one field: `Time`, a ZigZag varint32 containing the world tick.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-time-packet/
 */
export default class SetTimePacket extends NetworkPacket<SetTimePayload> {
    public get id(): number {
        return PacketIdentifier.SET_TIME;
    }

    public constructor(packetData?: SetTimePayload | Buffer | null, buffer?: Buffer) {
        super(
            Buffer.isBuffer(packetData) ? null : (packetData ?? null),
            Buffer.isBuffer(packetData) ? packetData : buffer
        );
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SetTimePayload): void {
        layoutAt(setTimePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SetTimePayload {
        return layoutAt(setTimePacket, this.codecProtocol).decode(stream);
    }
}
