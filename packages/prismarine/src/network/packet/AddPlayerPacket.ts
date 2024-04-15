import { Metadata } from '../../entity/Metadata';
import type { Item } from '../../item/Item';
import { NetworkUtil } from '../../network/NetworkUtil';
import type UUID from '../../utils/UUID';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class AddPlayerPacket extends DataPacket {
    public static NetID = Identifiers.AddPlayerPacket;

    public uuid!: UUID;
    public name!: string;
    public uniqueEntityId!: bigint;
    public runtimeEntityId!: bigint;
    public platformChatId!: string;

    public positionX: number = 0;
    public positionY: number = 5;
    public positionZ: number = 0;

    public motionX: number = 0;
    public motionY: number = 0;
    public motionZ: number = 0;

    public pitch!: number;
    public yaw!: number;
    public headYaw!: number;

    public gamemode: number = 0;
    public item!: Item;

    public deviceId!: string;
    public buildPlatform!: number;

    public metadata!: Metadata;

    constructor() {
        super();
        this.metadata = new Metadata();
    }

    public encodePayload() {
        this.uuid.networkSerialize(this);
        NetworkUtil.writeString(this, this.name);
        this.writeUnsignedVarLong(this.runtimeEntityId);
        NetworkUtil.writeString(this, this.platformChatId || '');

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
        this.writeVarInt(this.gamemode); // TODO: gamemode
        this.metadata.networkSerialize(this);

        this.writeUnsignedVarInt(0); // ? unknown
        this.writeUnsignedVarInt(0); // ? unknown

        this.writeLongLE(this.uniqueEntityId || this.runtimeEntityId);
        this.writeByte(0); // command permission
        this.writeByte(0); // permission level
        this.writeByte(0); // ? unknown

        this.writeUnsignedVarInt(0); // TODO: Entity links
        NetworkUtil.writeString(this, this.deviceId);
        this.writeIntLE(this.buildPlatform || -1); // TODO: OS enum
    }
}
