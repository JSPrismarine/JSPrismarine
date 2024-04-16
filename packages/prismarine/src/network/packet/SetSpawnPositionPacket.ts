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

        this.writeVarInt(this.position.getX());
        this.writeUnsignedVarInt(this.position.getY());
        this.writeVarInt(this.position.getZ());

        this.writeVarInt(this.dimension);

        this.writeVarInt(this.blockPosition.getX());
        this.writeUnsignedVarInt(this.blockPosition.getY());
        this.writeVarInt(this.blockPosition.getZ());
    }
}
