import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ItemStackRequestPacket extends DataPacket {
    public static NetID = Identifiers.ItemStackRequestPacket;

    public requests: any[] = [];

    public decodePayload() {
        const count = this.readUnsignedVarInt();
        for (let i = 0; i < count; i++) {
            // TODO: implement when we have a proper documentation
            // this.requests.push(this.readItemStackRequest());
        }
    }
}
