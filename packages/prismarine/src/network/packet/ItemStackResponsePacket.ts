import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';
import Item from '../../item/Item';

export default class ItemStackResponsePacket extends DataPacket {
    public static NetID = Identifiers.ItemStackResponsePacket;

    public responses = [];

    public encodePayload() {
        this.writeVarInt(this.responses.length);
        this.responses.forEach((response: Item) => {
            response.networkSerialize(this);
        });
    }
}
