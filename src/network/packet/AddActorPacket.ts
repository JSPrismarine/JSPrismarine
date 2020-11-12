import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class AddActorPacket extends DataPacket {
    static NetID = Identifiers.AddActorPacket;

    public uniqueEntityId!: bigint;
    public runtimeEntityId!: bigint;
    public type!: string;
    public x!: number;
    public y!: number;
    public z!: number;
    public motionX!: number;
    public motionY!: number;
    public motionZ!: number;
    public pitch!: number;
    public yaw!: number;
    public headYaw!: number;

    public attributes = [];
    public metadata = [];
    public links = [];

    encodePayload() {
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);

        this.writeString(this.type);

        this.writeLFloat(this.x);
        this.writeLFloat(this.y);
        this.writeLFloat(this.z);

        this.writeLFloat(this.motionX);
        this.writeLFloat(this.motionY);
        this.writeLFloat(this.motionZ);

        this.writeLFloat(this.pitch);
        this.writeLFloat(this.yaw);
        this.writeLFloat(this.headYaw);

        // TODO: attributes
        this.writeUnsignedVarInt(this.attributes.length);

        // TODO: metadata
        this.writeUnsignedVarInt(this.metadata.length);

        // TODO: links
        this.writeUnsignedVarInt(this.links.length);
    }
}
