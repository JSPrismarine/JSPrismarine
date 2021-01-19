import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class SetPlayerGameTypePacket extends DataPacket {
    public static NetID = Identifiers.SetPlayerGameTypePacket;

    public gamemode!: number;

    public decodePayload() {
        this.gamemode = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.gamemode);
    }
}
