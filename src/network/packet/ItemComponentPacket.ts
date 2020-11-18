import Identifiers from "../Identifiers";
import DataPacket from "./DataPacket";

export default class ItemComponentPacket extends DataPacket {   
    static NetID = Identifiers.ItemComponentPacket;

    public encodePayload(): void {
        this.writeUnsignedVarInt(0);  // item count
    }
}