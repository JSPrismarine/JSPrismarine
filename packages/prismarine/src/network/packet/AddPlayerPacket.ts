import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import type { Item } from '../../item/Item';
import McpeUtil from '../NetworkUtil';
import type MetadataManager from '../../entity/Metadata';
import type UUID from '../../utils/UUID';

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

    public item!: Item;

    public deviceId!: string;
    public buildPlatform!: number;

    public metadata!: MetadataManager;

    public encodePayload() {
        this.uuid.networkSerialize(this);
        McpeUtil.writeString(this, this.name);
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

        // TODO: figure out how to send AIR as item
        this.writeVarInt(0);
        // this.item.networkSerialize(this);
        this.writeVarInt(0); // TODO: gamemode
        this.metadata.networkSerialize(this);

        this.writeUnsignedVarInt(0); // ? unknown
        this.writeUnsignedVarInt(0); // ? unknown

        this.writeLongLE(this.uniqueEntityId ?? this.runtimeEntityId);
        this.writeByte(0); // command permission
        this.writeByte(0); // permission level
        this.writeByte(0); // ? unknown

        this.writeUnsignedVarInt(0); // TODO: Entity links
        McpeUtil.writeString(this, this.deviceId);
        this.writeIntLE(this.buildPlatform || -1); // TODO: OS enum
    }
}
