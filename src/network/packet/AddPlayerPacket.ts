import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class AddPlayerPacket extends DataPacket {
    static NetID = Identifiers.AddPlayerPacket;

    public uuid: string = '';
    public name: string = '';
    public uniqueEntityId: bigint = BigInt(0);
    public runtimeEntityId: bigint = BigInt(0);
    public platformChatId: string = ''; // TODO

    public positionX: number = 0;
    public positionY: number = 0;
    public positionZ: number = 0;

    public motionX: number = 0;
    public motionY: number = 0;
    public motionZ: number = 0;

    public pitch: number = 0;
    public yaw: number = 0;
    public headYaw: number = 0;

    public deviceId: string = '';
    public buildPlatform: number = 0; // TODO

    public metadata = new Map();

    public encodePayload() {
        this.writeUUID(this.uuid);
        this.writeString(this.name);
        this.writeVarLong(this.uniqueEntityId || this.runtimeEntityId);
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeString(this.platformChatId);

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

        this.writeLLong(BigInt(0)); // Unknown

        this.writeUnsignedVarInt(0); // TODO: Entity links
        this.writeString(this.deviceId);
        this.writeLInt(this.buildPlatform);
    }
}
