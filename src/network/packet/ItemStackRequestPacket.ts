import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ItemStackRequestPacket extends DataPacket {
    static NetID = Identifiers.ItemStackRequestPacket;

    public requests: any[] = [];

    public decodePayload() {
        let count = this.readUnsignedVarInt();
        for (let i = 0; i < count; i++) {
            this.requests.push(this.readItemStackRequest());
        }
    }
}
