import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import McpeUtil from '../NetworkUtil';

export default class DisconnectPacket extends DataPacket {
    public static NetID = Identifiers.DisconnectPacket;

    public hideDisconnectionWindow!: boolean;
    public message!: string;

    public encodePayload() {
        this.writeBoolean(this.hideDisconnectionWindow);

        if (!this.hideDisconnectionWindow) McpeUtil.writeString(this, this.message);
    }

    public decodePayload() {
        this.hideDisconnectionWindow = this.readBoolean();

        if (!this.hideDisconnectionWindow) this.message = McpeUtil.readString(this);
    }
}
