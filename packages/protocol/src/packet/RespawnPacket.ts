import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { respawnPacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../wire/WireLayout';
import type { PayloadOf } from '../wire/define';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The payload of {@link RespawnPacket}. */
export type RespawnPayload = PayloadOf<typeof respawnPacket>;

/**
 * One step of the client-server respawn handshake.
 *
 * Protocol 2193 payload order: `Position` as three little-endian floats, `State` as one byte,
 * then `Player Runtime Id` as an `ActorRuntimeID` varuint64. The state values are defined by
 * `PlayerRespawnState` in the Minecraft data package.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/respawn-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/types/player-respawn-state/
 */
export default class RespawnPacket extends NetworkPacket<RespawnPayload> {
    public get id(): number {
        return PacketIdentifier.RESPAWN;
    }

    public constructor(packetData?: RespawnPayload | Buffer | null, buffer?: Buffer) {
        super(
            Buffer.isBuffer(packetData) ? null : (packetData ?? null),
            Buffer.isBuffer(packetData) ? packetData : buffer
        );
    }

    protected serializePayload(stream: NetworkBinaryStream, data: RespawnPayload): void {
        layoutAt(respawnPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): RespawnPayload {
        return layoutAt(respawnPacket, this.codecProtocol).decode(stream);
    }
}
