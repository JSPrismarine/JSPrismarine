import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import Vector3 from '../../math/Vector3.js';

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
