import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

export default class LevelSoundEventPacket extends DataPacket {
    public static NetID = Identifiers.LevelSoundEventPacket;

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

        this.positionX = this.readFloatLE();
        this.positionY = this.readFloatLE();
        this.positionZ = this.readFloatLE();

        this.extraData = this.readVarInt();
        this.entityType = McpeUtil.readString(this);
        this.isBabyMob = this.readBoolean();
        this.disableRelativeVolume = this.readBoolean();
    }

    public encodePayload() {
        this.writeUnsignedVarInt(this.sound);

        this.writeFloatLE(this.positionX);
        this.writeFloatLE(this.positionY);
        this.writeFloatLE(this.positionZ);

        this.writeVarInt(this.extraData);
        McpeUtil.writeString(this, this.entityType);
        this.writeBoolean(this.isBabyMob);
        this.writeBoolean(this.disableRelativeVolume);
    }
}
