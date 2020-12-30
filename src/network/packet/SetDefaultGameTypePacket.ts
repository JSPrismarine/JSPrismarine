import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class SetDefaultGameTypePacket extends DataPacket {
    static NetID = Identifiers.SetDefaultGameTypePacket;

    public gamemode!: number;

    public decodePayload() {
        this.gamemode = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.gamemode);
    }
}
