import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class AddActorPacket extends DataPacket {
    public static NetID = Identifiers.AddActorPacket;

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
    public metadata!: Map<number, [number, bigint | number | boolean | string]>;
    public links = [];

    public encodePayload() {
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

        // TODO: fixme
        const metadata = Array.from(this.metadata);
        this.writeUnsignedVarInt(/* metadata.length */ 0);

        /* metadata.forEach(([key, [type, value]]) => {
            this.writeUnsignedVarInt(key);
            this.writeUnsignedVarInt(type);

            switch (type) {
                case FlagType.BYTE:
                    this.writeByte(value as number);
                    break;
                case FlagType.SHORT:
                    this.writeShort(value as number);
                    break;
                case FlagType.INT:
                    this.writeVarInt(value as number);
                    break;
                case FlagType.FLOAT:
                    this.writeFloat(value as number);
                    break;
                case FlagType.STRING:
                    this.writeString(value as string);
                    break;
                case FlagType.ITEM:
                    // TODO:
                    break;
                case FlagType.POSITION:
                    // TODO:
                    break;
                case FlagType.LONG:
                    this.writeLong(value as bigint);
                    break;
                case FlagType.VECTOR:
                    // TODO:
                    break;
                default:
                    throw new Error(`Invalid type: ${type}`);
            }
        }); */

        // TODO: links
        this.writeUnsignedVarInt(this.links.length);
    }
}
