import UUID from '../../utils/uuid';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class AddPlayerPacket extends DataPacket {
    static NetID = Identifiers.AddPlayerPacket;

    public uuid!: UUID;
    public name!: string;
    public uniqueEntityId!: bigint;
    public runtimeEntityId!: bigint;
    public platformChatId!: string;

    public positionX!: number;
    public positionY!: number;
    public positionZ!: number;

    public motionX!: number;
    public motionY!: number;
    public motionZ!: number;

    public pitch!: number;
    public yaw!: number;
    public headYaw!: number;

    public deviceId!: string;
    public buildPlatform!: number;

    public metadata = new Map();

    public encodePayload() {
        this.writeUUID(this.uuid);
        this.writeString(this.name);
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeString(this.platformChatId || '');

        this.writeLFloat(this.positionX);
        this.writeLFloat(this.positionY);
        this.writeLFloat(this.positionZ);

        this.writeLFloat(this.motionX);
        this.writeLFloat(this.motionY);
        this.writeLFloat(this.motionZ);

        this.writeLFloat(this.pitch);
        this.writeLFloat(this.yaw);
        this.writeLFloat(this.headYaw);

        this.writeVarInt(0); // TODO: Item id
        this.writeEntityMetadata(this.metadata);

        for (let i = 0; i < 5; i++) {
            this.writeUnsignedVarInt(0); // TODO: Adventure settings
        }

        // userId
        // if (this.uniqueEntityId & 1n) {
        //    this.writeLLong(-1n * ((this.uniqueEntityId + 1n) >> 1n));
        // } else {
        //     this.writeLLong(this.uniqueEntityId >> 1n);
        // }

        this.writeLLong(BigInt(0)); // TODO: fix userid

        this.writeUnsignedVarInt(0); // TODO: Entity links
        this.writeString(this.deviceId);
        this.writeLInt(this.buildPlatform || -1); // TODO: OS enum
    }
}
