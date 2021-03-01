import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Vector3 from '../../math/Vector3';

export default class SpawnParticleEffectPacket extends DataPacket {
    public static NetID = Identifiers.SpawnParticleEffectPacket;

    public dimensionId!: number;
    public uniqueEntityId!: bigint;
    public position!: Vector3;
    public identifier!: string;

    public decodePayload() {
        this.dimensionId = this.readByte();
        this.uniqueEntityId = this.readVarLong();
        this.position = this.readVector3();
        this.identifier = this.readString();
    }

    public encodePayload() {
        this.writeByte(this.dimensionId);
        this.writeVarLong(this.uniqueEntityId);
        this.writeVector3(this.position);
        this.writeString(this.identifier);
    }
}
