import { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export enum SpawnType {
    PLAYER_SPAWN,
    WORLD_SPAWN
}

export default class SetSpawnPositionPacket extends DataPacket {
    public static NetID = Identifiers.SetSpawnPositionPacket;

    public type!: SpawnType;
    public position!: Vector3;
    public dimension!: number;
    public blockPosition!: Vector3;

    public decodePayload(): void {
        this.type = this.readVarInt();
        this.position = new Vector3(this.readVarInt(), this.readUnsignedVarInt(), this.readVarInt());
        this.dimension = this.readVarInt();
        this.blockPosition = new Vector3(this.readVarInt(), this.readUnsignedVarInt(), this.readVarInt());
    }

    public encodePayload(): void {
        this.writeVarInt(this.type);

        // Three signed varints. The Y went out unsigned, which is the same bytes above sea
        // level and the wrong ones below it.
        this.writeVarInt(this.position.getX());
        this.writeVarInt(this.position.getY());
        this.writeVarInt(this.position.getZ());

        this.writeVarInt(this.dimension);

        this.writeVarInt(this.blockPosition.getX());
        this.writeVarInt(this.blockPosition.getY());
        this.writeVarInt(this.blockPosition.getZ());
    }
}
