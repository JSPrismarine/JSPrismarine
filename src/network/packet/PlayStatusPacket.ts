import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

export default class PlayStatusPacket extends DataPacket {
    static NetID = Identifiers.PlayStatusPacket;

    public status: number = 0;

    public encodePayload() {
        this.writeInt(this.status);
    }
}
