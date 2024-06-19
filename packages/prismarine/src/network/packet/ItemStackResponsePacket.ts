import type { Item } from '../../item/Item';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ItemStackResponsePacket extends DataPacket {
    public static NetID = Identifiers.ItemStackResponsePacket;

    public responses = [];

    public encodePayload(): void {
        this.writeVarInt(this.responses.length);
        this.responses.forEach((response: Item) => {
            response.networkSerialize(this);
        });
    }
}
