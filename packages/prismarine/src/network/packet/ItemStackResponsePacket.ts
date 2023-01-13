import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';
import Item from '../../item/Item.js';

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
