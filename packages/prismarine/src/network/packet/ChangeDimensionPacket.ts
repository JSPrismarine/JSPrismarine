import { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ChangeDimensionPacket extends DataPacket {
    public static NetID = Identifiers.ChangeDimensionPacket;

    public dimension!: number;
    public position = new Vector3(0, 0, 0);
    public respawn!: boolean;

    public decodePayload() {
        this.dimension = this.readVarInt();
        this.position = Vector3.networkDeserialize(this);
        this.respawn = this.readBoolean();
    }

    public encodePayload() {
        this.writeVarInt(this.dimension);
        this.position.networkSerialize(this);
        this.writeBoolean(this.respawn);
    }
}
