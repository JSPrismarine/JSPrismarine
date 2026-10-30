import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { playerHotbarPacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../wire/WireLayout';
import type { PayloadOf } from '../wire/define';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The payload of {@link PlayerHotbarPacket}. */
export type PlayerHotbarPayload = PayloadOf<typeof playerHotbarPacket>;

/**
 * Tells the client which hotbar slot to select in a container.
 *
 * The payload contains `Selected Slot` as a varuint32, `Container ID` as a uint8, and
 * `Should Select Slot` as a boolean. When the flag is false, the client receives the slot
 * without changing its current selection. The server also sends this packet when commands,
 * pick-block behavior, or join data choose a slot for the player.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-hotbar-packet/
 */
export default class PlayerHotbarPacket extends NetworkPacket<PlayerHotbarPayload> {
    public get id(): number {
        return PacketIdentifier.PLAYER_HOTBAR;
    }

    public constructor(packetData?: PlayerHotbarPayload | Buffer | null, buffer?: Buffer) {
        super(
            Buffer.isBuffer(packetData) ? null : (packetData ?? null),
            Buffer.isBuffer(packetData) ? packetData : buffer
        );
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerHotbarPayload): void {
        layoutAt(playerHotbarPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerHotbarPayload {
        return layoutAt(playerHotbarPacket, this.codecProtocol).decode(stream);
    }
}
