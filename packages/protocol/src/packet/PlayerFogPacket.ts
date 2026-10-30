import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { playerFogPacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../wire/WireLayout';
import type { PayloadOf } from '../wire/define';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The payload of {@link PlayerFogPacket}. */
export type PlayerFogPayload = PayloadOf<typeof playerFogPacket>;

/**
 * Replaces the fog stack rendered by the receiving client.
 *
 * The payload contains `Fog Stack` as a varuint32 count followed by that many identifiers.
 * The complete stack is sent each time; an empty list clears fog added by `/fog`. Identifiers
 * name definitions in the client's active resource packs, such as `minecraft:fog_ocean`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/player-fog-packet/
 */
export default class PlayerFogPacket extends NetworkPacket<PlayerFogPayload> {
    public get id(): number {
        return PacketIdentifier.PLAYER_FOG;
    }

    public constructor(packetData?: PlayerFogPayload | Buffer | null, buffer?: Buffer) {
        super(
            Buffer.isBuffer(packetData) ? null : (packetData ?? null),
            Buffer.isBuffer(packetData) ? packetData : buffer
        );
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerFogPayload): void {
        layoutAt(playerFogPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerFogPayload {
        return layoutAt(playerFogPacket, this.codecProtocol).decode(stream);
    }
}
