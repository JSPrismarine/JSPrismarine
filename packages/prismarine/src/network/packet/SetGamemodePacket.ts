import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class SetGamemodePacket extends DataPacket {
    public static NetID = Identifiers.SetPlayerGameTypePacket;

    public gamemode!: number;

    public encodePayload() {
        this.writeVarInt(this.gamemode);
    }

    public decodePayload() {
        this.gamemode = this.readVarInt();
    }
}
