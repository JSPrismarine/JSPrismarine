import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/** The docs' `SpawnPositionType`, written as a ZigZag varint32. */
export enum SpawnPositionType {
    PlayerRespawn,
    WorldSpawn
}

/**
 * Sent by the server on login and when the world spawn changes.
 *
 * Protocol 2193 layout: Spawn Position Type (ZigZag varint32), Block Position (`BlockPos`:
 * x, y, z as ZigZag varint32), Dimension type (ZigZag varint32), Spawn Block Pos (`BlockPos`).
 * `position` is the Block Position field and `blockPosition` is the Spawn Block Pos field.
 */
export default class SetSpawnPositionPacket extends DataPacket {
    public static NetID = Identifiers.SetSpawnPositionPacket;

    public type!: SpawnPositionType;
    public position!: Vector3;
    public dimension!: number;
    public blockPosition!: Vector3;

    public decodePayload(): void {
        this.type = this.readVarInt();
        this.position = NetworkUtil.readBlockPosition(this);
        this.dimension = this.readVarInt();
        this.blockPosition = NetworkUtil.readBlockPosition(this);
    }

    public encodePayload(): void {
        this.writeVarInt(this.type);
        // Both positions are BlockPos: x, y and z as signed varints.
        NetworkUtil.writeBlockPosition(this, this.position);
        this.writeVarInt(this.dimension);
        NetworkUtil.writeBlockPosition(this, this.blockPosition);
    }
}
