import ContainerEntry from '../../inventory/ContainerEntry';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';
import MetadataManager from '../../entity/Metadata';
import UUID from '../../utils/UUID';

export default class AddPlayerPacket extends DataPacket {
    public static NetID = Identifiers.AddPlayerPacket;

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

    public item!: ContainerEntry;

    public deviceId!: string;
    public buildPlatform!: number;

    public metadata!: MetadataManager;

    public encodePayload() {
        this.uuid.networkSerialize(this);
        McpeUtil.writeString(this, this.name);
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);
        McpeUtil.writeString(this, this.platformChatId ?? '');

        this.writeFloatLE(this.positionX);
        this.writeFloatLE(this.positionY);
        this.writeFloatLE(this.positionZ);

        this.writeFloatLE(this.motionX);
        this.writeFloatLE(this.motionY);
        this.writeFloatLE(this.motionZ);

        this.writeFloatLE(this.pitch);
        this.writeFloatLE(this.yaw);
        this.writeFloatLE(this.headYaw);

        this.item.networkSerialize(this);
        this.writeVarInt(0); // TODO: gamemode
        this.metadata.networkSerialize(this);

        for (let i = 0; i < 5; i++) {
            this.writeUnsignedVarInt(0); // TODO: Adventure settings
        }

        // UserId
        // if (this.uniqueEntityId & 1n) {
        //    this.writeLLong(-1n * ((this.uniqueEntityId + 1n) >> 1n));
        // } else {
        //     this.writeLLong(this.uniqueEntityId >> 1n);
        // }

        this.writeLongLE(BigInt(0)); // TODO: fix userid

        this.writeUnsignedVarInt(0); // TODO: Entity links
        McpeUtil.writeString(this, this.deviceId);
        this.writeIntLE(this.buildPlatform || -1); // TODO: OS enum
    }
}
