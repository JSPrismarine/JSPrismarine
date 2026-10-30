import { layoutAt, setSpawnPositionPacket } from '@jsprismarine/protocol';

import { Vector3 } from '@jsprismarine/math';
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
    public type!: SpawnPositionType;
    public position!: Vector3;
    public dimension!: number;
    public blockPosition!: Vector3;

    public decodePayload(): void {
        const read = layoutAt(setSpawnPositionPacket, this.codecProtocol).decode(this);
        this.type = read.type;
        this.position = new Vector3(read.position.x, read.position.y, read.position.z);
        this.dimension = read.dimension;
        this.blockPosition = new Vector3(read.blockPosition.x, read.blockPosition.y, read.blockPosition.z);
    }

    public encodePayload(): void {
        layoutAt(setSpawnPositionPacket, this.codecProtocol).encode(this, {
            type: this.type,
            position: { x: this.position.getX(), y: this.position.getY(), z: this.position.getZ() },
            dimension: this.dimension,
            blockPosition: {
                x: this.blockPosition.getX(),
                y: this.blockPosition.getY(),
                z: this.blockPosition.getZ()
            }
        });
    }
}
