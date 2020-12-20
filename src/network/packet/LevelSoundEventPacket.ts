import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class LevelSoundEventPacket extends DataPacket {
    static NetID = Identifiers.LevelSoundEventPacket;

    public sound!: number;

    public positionX!: number;
    public positionY!: number;
    public positionZ!: number;

    public extraData!: number;
    public entityType!: string;
    public isBabyMob!: boolean;
    public disableRelativeVolume!: boolean;

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
