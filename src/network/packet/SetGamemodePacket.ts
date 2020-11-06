import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetGamemodePacket extends DataPacket {
    static NetID = Identifiers.SetPlayerGameTypePacket;

    public gamemode: number = 0;

    public encodePayload() {
        this.writeVarInt(this.gamemode);
    }
}
