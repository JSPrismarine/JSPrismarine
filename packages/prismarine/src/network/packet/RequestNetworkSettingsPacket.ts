import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

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
