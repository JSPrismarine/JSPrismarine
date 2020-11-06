import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetTitlePacket extends DataPacket {
    static NetID = Identifiers.SetTitlePacket;

    public type: number = 0;
    public text: string = '';
    public fadeInTime: number = 500;
    public stayTime: number = 3000;
    public fadeOutTime: number = 1000;

    public decodePayload() {
        this.type = this.readVarInt();
        this.text = this.readString();
        this.fadeInTime = this.readVarInt();
        this.stayTime = this.readVarInt();
        this.fadeOutTime = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.type);
        this.writeString(this.text);
        this.writeVarInt(this.fadeInTime);
        this.writeVarInt(this.stayTime);
        this.writeVarInt(this.fadeOutTime);
    }
}
