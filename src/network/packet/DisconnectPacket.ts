import Identifiers from '../Identifiers';
import DataPacket from './Packet';

export default class DisconnectPacket extends DataPacket {
    static NetID = Identifiers.DisconnectPacket;

    hideDisconnectionWindow: boolean = false;
    message: string = '';

    encodePayload() {
        this.writeBool(+this.hideDisconnectionWindow);
        if (!this.hideDisconnectionWindow) {
            this.writeString(this.message);
        }
    }
}
