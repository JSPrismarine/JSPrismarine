import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

export default class ItemComponentPacket extends DataPacket {
    public static NetID = Identifiers.ItemComponentPacket;

    public encodePayload(): void {
        this.writeUnsignedVarInt(0); // Item count
    }
}
