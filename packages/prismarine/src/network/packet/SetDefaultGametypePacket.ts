import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class SetDefaultGametypePacket extends DataPacket {
    public static NetID = Identifiers.SetDefaultGametypePacket;

    /**
     * The gamemode to be set as default.
     *
     * @defaultValue `0` - survival mode
     */
    public gamemode: number = 0;

    public decodePayload(): void {
        this.gamemode = this.readVarInt();
    }

    public encodePayload(): void {
        this.writeVarInt(this.gamemode);
    }
}
