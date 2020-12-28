import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ItemStackRequestPacket extends DataPacket {
    static NetID = Identifiers.ItemStackRequestPacket;

    public requests: any[] = [];

    public decodePayload() {
        const count = this.readUnsignedVarInt();
        for (let i = 0; i < count; i++) {
            this.requests.push(this.readItemStackRequest());
        }
    }
}
