import DataPacket from './DataPacket';
import Identifiers from '../Identifiers';

export default class SetDefaultGameTypePacket extends DataPacket {
    public static NetID = Identifiers.SetDefaultGameTypePacket;

    /**
     * The gamemode to be set as default.
     *
     * @defaultValue `0` - survival mode
     */
    public gamemode: number = 0;

    public decodePayload() {
        this.gamemode = this.readVarInt();
    }

    public encodePayload() {
        this.writeVarInt(this.gamemode);
    }
}
