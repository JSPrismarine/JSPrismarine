import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class AddActorPacket extends DataPacket {
    static NetID = Identifiers.AddActorPacket;

    public uniqueEntityId: bigint = BigInt(0);
    public runtimeEntityId: bigint = BigInt(0);
    public type: string = '';
    public x: number = 0;
    public y: number = 0;
    public z: number = 0;
    public motionX: number = 0;
    public motionY: number = 0;
    public motionZ: number = 0;
    public pitch: number = 0;
    public yaw: number = 0;
    public headYaw: number = 0;

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
        this.writeUnsignedVarInt(0);

        // TODO: metadata
        this.writeUnsignedVarInt(0);

        // TODO: links
        this.writeUnsignedVarInt(0);
    }
}
