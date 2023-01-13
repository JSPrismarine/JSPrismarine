import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class RequestNetworkSettingsPacket extends DataPacket {
    public static NetID = Identifiers.RequestNetworkSettingsPacket;

    public protocolVersion!: number;

    public encodePayload() {
        this.writeInt(this.protocolVersion);
    }

    public decodePayload() {
        this.protocolVersion = this.readInt();
    }
}
