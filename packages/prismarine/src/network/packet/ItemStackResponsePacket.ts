import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class ItemStackResponsePacket extends DataPacket {
    public static NetID = Identifiers.ItemStackResponsePacket;

    public responses = [];

    public encodePayload() {
        this.writeVarInt(this.responses.length);
        this.responses.forEach((response) => {
            this.writeItemStack(response);
        });
    }
}
