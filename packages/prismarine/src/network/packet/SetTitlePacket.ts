import { NetworkUtil } from '../../network/NetworkUtil';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetTitlePacket extends DataPacket {
    public static NetID = Identifiers.SetTitlePacket;

    public type!: number;
    public text!: string;
    public fadeInTime!: number;
    public stayTime!: number;
    public fadeOutTime!: number;

    public decodePayload() {
        this.type = this.readVarInt();
        this.text = NetworkUtil.readString(this);
        this.fadeInTime = this.readVarInt();
        this.stayTime = this.readVarInt();
        this.fadeOutTime = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.type);
        NetworkUtil.writeString(this, this.text);
        this.writeVarInt(this.fadeInTime || 500);
        this.writeVarInt(this.stayTime || 3000);
        this.writeVarInt(this.fadeOutTime || 1000);
    }
}
