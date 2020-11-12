import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetGamemodePacket extends DataPacket {
    static NetID = Identifiers.SetPlayerGameTypePacket;

    public gamemode!: number;

    public encodePayload() {
        this.writeVarInt(this.gamemode);
    }

    public decodePayload() {
        this.gamemode = this.readVarInt();
    }
}
