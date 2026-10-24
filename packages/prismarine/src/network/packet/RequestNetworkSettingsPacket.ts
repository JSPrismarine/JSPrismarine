import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class RequestNetworkSettingsPacket extends DataPacket {
    public static NetID = Identifiers.RequestNetworkSettingsPacket;

    public protocolVersion!: number;

    public encodePayload(): void {
        this.writeInt(this.protocolVersion);
    }

    public decodePayload(): void {
        this.protocolVersion = this.readInt();
    }
}
