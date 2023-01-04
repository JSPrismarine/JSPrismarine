import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import McpeUtil from '../NetworkUtil.js';
import Vector3 from '../../math/Vector3.js';

export default class SpawnParticleEffectPacket extends DataPacket {
    public static NetID = Identifiers.SpawnParticleEffectPacket;

    public dimensionId!: number;
    public uniqueEntityId!: bigint;
    public position!: Vector3;
    public identifier!: string;
    public molangJson!: string;

    public decodePayload() {
        this.dimensionId = this.readByte();
        this.uniqueEntityId = this.readVarLong();
        this.position = Vector3.networkDeserialize(this);
        this.identifier = McpeUtil.readString(this);
        this.molangJson = McpeUtil.readString(this);
    }

    public encodePayload() {
        this.writeByte(this.dimensionId);
        this.writeVarLong(this.uniqueEntityId);
        this.position.networkSerialize(this);
        McpeUtil.writeString(this, this.identifier);
        McpeUtil.writeString(this, this.molangJson);
    }
}
