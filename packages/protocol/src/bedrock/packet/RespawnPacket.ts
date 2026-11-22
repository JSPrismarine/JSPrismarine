import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { respawnPacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../../wire/WireLayout';
import type { PayloadOf } from '../../wire/define';

import type NetworkBinaryStream from '../../NetworkBinaryStream';

/** The respawn position, transition state, and runtime id for the respawning player. */
export type RespawnPayload = PayloadOf<typeof respawnPacket>;

/**
 * One step of the client-server respawn handshake.
 *
 * Payload order at protocols 2193 and 2225: `Position` as three little-endian floats, `State` as one byte,
 * then `Player Runtime Id` as an `ActorRuntimeID` varuint64. The state values are defined by
 * `PlayerRespawnState` in the Minecraft data package.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/respawn-packet/
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/types/player-respawn-state/
 */
export default class RespawnPacket extends NetworkPacket<RespawnPayload> {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'RespawnPacket';
    }

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
