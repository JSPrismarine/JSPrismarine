import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import McpeUtil from '../NetworkUtil.js';

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
