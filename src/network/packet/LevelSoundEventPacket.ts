import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class LevelSoundEventPacket extends DataPacket {
    static NetID = Identifiers.LevelSoundEventPacket;

    public sound: number = 0;

    public positionX: number = 0;
    public positionY: number = 0;
    public positionZ: number = 0;

    public extraData: number = 0;
    public entityType: string = '';
    public isBabyMob: boolean = false;
    public disableRelativeVolume: boolean = false;

    public decodePayload() {
        this.sound = this.readUnsignedVarInt();

        this.positionX = this.readLFloat();
        this.positionY = this.readLFloat();
        this.positionZ = this.readLFloat();

        this.extraData = this.readVarInt();
        this.entityType = this.readString();
        this.isBabyMob = this.readBool();
        this.disableRelativeVolume = this.readBool();
    }

    public encodePayload() {
        this.writeUnsignedVarInt(this.sound);

        this.writeLFloat(this.positionX);
        this.writeLFloat(this.positionY);
        this.writeLFloat(this.positionZ);

        this.writeVarInt(this.extraData);
        this.writeString(this.entityType);
        this.writeBool(this.isBabyMob);
        this.writeBool(this.disableRelativeVolume);
    }
}
