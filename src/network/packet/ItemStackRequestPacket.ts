import ItemRequest from '../../item/request/ItemRequest';
import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ItemStackRequestPacket extends DataPacket {
    public static NetID = Identifiers.ItemStackRequestPacket;

    public requests: Array<ItemRequest> = [];

    public decodePayload(): void {
        const count = this.readUnsignedVarInt();
        for (let i = 0; i < count; i++) {
            const req = this.readItemStackRequest();
            console.log(req);
            this.requests.push(req);
        }
    }
}
