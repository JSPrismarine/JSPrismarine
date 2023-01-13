import DataPacket from './DataPacket.js';
import Identifiers from '../Identifiers.js';

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
