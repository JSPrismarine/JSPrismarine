import { layoutAt } from '../wire/WireLayout';
import { setHealthPacket } from '../wire/definitions/worldStatus';
import type { PayloadOf } from '../wire/define';
import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The `Health` field sent by {@link SetHealthPacket}. */
export type SetHealthPayload = PayloadOf<typeof setHealthPacket>;

/**
 * Sets the health bar of the receiving client.
 *
 * Protocol 2193 carries one field, `Health`, as a ZigZag varint32. The server sends it when a
 * player spawns or respawns. It has no actor identifier, so its value applies to the receiving
 * player's health display.
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-health-packet/
 */
export default class SetHealthPacket extends NetworkPacket<SetHealthPayload> {
    public get id(): number {
        return PacketIdentifier.SET_HEALTH;
    }

    public constructor(packetData?: SetHealthPayload | Buffer | null, buffer?: Buffer) {
        const data = Buffer.isBuffer(packetData) ? null : (packetData ?? { health: 20 });
        super(data, Buffer.isBuffer(packetData) ? packetData : buffer);
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SetHealthPayload): void {
        layoutAt(setHealthPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SetHealthPayload {
        return layoutAt(setHealthPacket, this.codecProtocol).decode(stream);
    }
}
