import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Vector3 from '../../math/Vector3';

export default class ChangeDimensionPacket extends DataPacket {
    public static NetID = Identifiers.ChangeDimensionPacket;

    public dimension!: number;
    public position!: Vector3;
    public respawn!: boolean;

    public decodePayload() {
        this.dimension = this.readVarInt();
        this.position = this.readVector3();
        this.respawn = this.readBool();
    }

    public encodePayload() {
        this.writeVarInt(this.dimension);
        this.writeVector3(this.position);
        this.writeBool(this.respawn);
    }
}
