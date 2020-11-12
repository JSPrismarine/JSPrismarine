import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class DisconnectPacket extends DataPacket {
    static NetID = Identifiers.DisconnectPacket;

    public hideDisconnectionWindow!: boolean;
    public message!: string;

    encodePayload() {
        this.writeBool(this.hideDisconnectionWindow);

        if (!this.hideDisconnectionWindow) this.writeString(this.message);
    }

    decodePayload() {
        this.hideDisconnectionWindow = this.readBool();

        if (!this.hideDisconnectionWindow) this.message = this.readString();
    }
}
