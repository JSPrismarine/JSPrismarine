import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class ItemStackResponsePacket extends DataPacket {
    static NetID = Identifiers.ItemStackResponsePacket;

    public responses = [];

    public encodePayload() {
        this.writeVarInt(this.responses.length);
        this.responses.forEach((response) => {
            this.writeItemStack(response);
        });
    }
}
