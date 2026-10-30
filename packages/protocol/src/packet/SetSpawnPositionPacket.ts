import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { setSpawnPositionPacket } from '../wire/definitions/worldStatus';
import { layoutAt } from '../wire/WireLayout';
import type { PayloadOf } from '../wire/define';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** Known values for the `Spawn Position Type` field. */
export enum SpawnPositionType {
    /** The position is a player's respawn point. */
    PlayerRespawn,
    /** The position is the world's default spawn point. */
    WorldSpawn
}

/** A world or player spawn type, its dimension, and the related block positions. */
export type SetSpawnPositionPayload = PayloadOf<typeof setSpawnPositionPacket>;

/**
 * Tells a client the player's respawn point or the world's spawn point.
 *
 * The payload contains a `Spawn Position Type`, `Block Position`, `Dimension type`, and
 * `Spawn Block Pos`, in that order. Both positions use three ZigZag varint32 coordinates. A
 * bed respawn position is sent through `RespawnPacket` instead.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/set-spawn-position-packet/
 */
export default class SetSpawnPositionPacket extends NetworkPacket<SetSpawnPositionPayload> {
    public get id(): number {
        return PacketIdentifier.SET_SPAWN_POSITION;
    }

    public constructor(packetData?: SetSpawnPositionPayload | Buffer | null, buffer?: Buffer) {
        super(
            Buffer.isBuffer(packetData) ? null : (packetData ?? null),
            Buffer.isBuffer(packetData) ? packetData : buffer
        );
    }

    protected serializePayload(stream: NetworkBinaryStream, data: SetSpawnPositionPayload): void {
        layoutAt(setSpawnPositionPacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): SetSpawnPositionPayload {
        return layoutAt(setSpawnPositionPacket, this.codecProtocol).decode(stream);
    }
}
